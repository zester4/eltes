/**
 * app/api/agent/run/workflow/route.ts
 *
 * Durable Upstash Workflow endpoint for the `/agent` slash command.
 *
 * Three workflow steps:
 *   1. recall-context   — semantic memory lookup (fast, ~1 s)
 *   2. execute          — full generateText run with all Composio + built-in tools
 *                         • writes progress card after every model step via onStepFinish
 *   3. finalize         — persist result, mark task complete, save readable message
 *
 * Progress contract:
 *   • Each step starts with status="running" and upserts the progress card.
 *   • Each step ends with status="completed"/"failed" and upserts again.
 *   • The progress card message ID is deterministic (workflowProgressMessageId(taskId))
 *     so every upsert is idempotent — Upstash retries are safe.
 *   • On completion, a normal assistant message is also saved so the user
 *     gets a clean, copyable answer beneath the progress card.
 *
 * Step return values (step1, step2) are serialised by Upstash Workflow and
 * replayed on retries, so subsequent steps never lose prior step data.
 */

import { serve } from "@upstash/workflow/nextjs";
import { convertToModelMessages, generateText, stepCountIs } from "ai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { Index } from "@upstash/vector";
import { getLanguageModel } from "@/lib/ai/providers";
import { regularPrompt, sessionTailPrompt } from "@/lib/ai/prompts";
import { createDocument } from "@/lib/ai/tools/create-document";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { getWeather } from "@/lib/ai/tools/get-weather";
import {
  saveMemory,
  recallMemory,
  updateMemory,
  deleteMemory,
} from "@/lib/ai/tools/memory";
import {
  setReminder,
  setCronJob,
  listSchedules,
  deleteSchedule,
} from "@/lib/ai/tools/schedule";
import {
  setupTrigger,
  listActiveTriggers,
  removeTrigger,
} from "@/lib/ai/tools/triggers";
import {
  delegateToSubAgent,
  getSubAgentResult,
  listSubAgents,
} from "@/lib/ai/tools/subagents";
import {
  upsertKnowledgeEntity,
  addKnowledgeRelation,
  getKnowledgeEntity,
  searchKnowledgeGraph,
  deleteKnowledgeEntity,
  deleteKnowledgeRelation,
} from "@/lib/ai/tools/knowledge-graph";
import {
  addGoal,
  updateGoal,
  logGoalProgress,
  listGoals,
  deleteGoal,
} from "@/lib/ai/tools/goals";
import { launchMission, getMissionStatus } from "@/lib/ai/tools/missions";
import {
  tavilySearch,
  tavilyExtract,
  tavilyCrawl,
  tavilyMap,
} from "@/lib/ai/tools/tavily-search";
import { wikiQuery, wikiIngest } from "@/lib/ai/tools/wiki";
import * as daytonaBrowserTools from "@/lib/ai/tools/daytona-browser";
import * as twilioTools from "@/lib/ai/tools/twilio";
import { getMessagesByChatId, saveMessages, updateAgentTask } from "@/lib/db/queries";
import { convertToUIMessages, generateUUID, getTextFromMessage } from "@/lib/utils";
import { getSessionTail, saveSessionTail } from "@/lib/session-tail";
import { upsertWorkflowProgress } from "@/lib/agent/workflow-progress.server";
import {
  makeRunningStep,
  completeStep,
  failStep,
  type WorkflowStep,
} from "@/lib/agent/workflow-progress";
import type { AgentRunWorkflowPayload } from "@/lib/workflow/client";
import type { DBMessage } from "@/lib/db/schema";

export const maxDuration = 300;

const composio = new Composio({ provider: new VercelProvider() });

const BASE_URL =
  process.env.BASE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined) ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

// ── Workflow ──────────────────────────────────────────────────────────────────

export const { POST } = serve<AgentRunWorkflowPayload>(async (context) => {
  const { taskId, userId, chatId, task, model } = context.requestPayload;
  const workflowRunId = context.workflowRunId;
  const startedAt = new Date().toISOString();

  // ── Step 1: recall-context ─────────────────────────────────────────────────
  const { memoryContext, step1 } = await context.run(
    "recall-context",
    async (): Promise<{ memoryContext: string; step1: WorkflowStep }> => {
      const s = makeRunningStep(0, "recall-context", "Recalling relevant context");
      await upsertWorkflowProgress({
        chatId, taskId, workflowRunId, task,
        steps: [s],
        startedAt,
      });

      let memory = "";
      try {
        const index = new Index({
          url: process.env.UPSTASH_VECTOR_REST_URL!,
          token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
        });
        const ns = index.namespace(`memory-${userId}`);
        const results = await ns.query({
          data: task,
          topK: 7,
          includeMetadata: true,
        });
        const lines = results
          .map((r) => {
            const m = r.metadata as Record<string, string> | undefined;
            return m?.content ? `• [${m.key ?? "memory"}]: ${m.content}` : null;
          })
          .filter(Boolean)
          .join("\n");
        memory = lines;
      } catch (err) {
        console.error("[AgentRunWorkflow] Memory recall failed:", err);
        // Non-fatal — continue without memory context
      }

      const done = completeStep(s, {
        output: memory ? `${memory.split("\n").length} memories loaded` : "No memories found",
      });
      await upsertWorkflowProgress({
        chatId, taskId, workflowRunId, task,
        steps: [done],
        startedAt,
      });

      return { memoryContext: memory, step1: done };
    },
  );

  // ── Step 2: execute ────────────────────────────────────────────────────────
  const { resultText, step2 } = await context.run(
    "execute",
    async (): Promise<{ resultText: string; step2: WorkflowStep }> => {
      const s = makeRunningStep(1, "execute", "Executing with full tool access");
      await upsertWorkflowProgress({
        chatId, taskId, workflowRunId, task,
        steps: [step1, s],
        startedAt,
      });

      // Load chat history & session tail for context continuity
      const [dbMessages, sessionTail] = await Promise.all([
        getMessagesByChatId({ id: chatId }),
        getSessionTail(userId),
      ]);

      const uiMessages = convertToUIMessages(dbMessages);
      let onboardingTail: { role: "assistant"; text: string }[] = [];

      // Onboarding check for new users
      if (uiMessages.length <= 1) {
        try {
          const index = new Index({
            url: process.env.UPSTASH_VECTOR_REST_URL!,
            token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
          });
          const ns = index.namespace(`memory-${userId}`);
          const onboarding = await ns.fetch(["onboarding_complete"]);
          if (!onboarding || onboarding.length === 0) {
            onboardingTail = [
              {
                role: "assistant",
                text: "SYSTEM: User is new. You MUST start with a guided setup: 'Hi! I'm Etles. Let's take 2 minutes to set you up. What do you do for work? what apps do you use (Gmail, Slack, GitHub, etc.)?' Proactively save every answer using saveMemory. When they finish, saveMemory with key 'onboarding_complete' to register their background jobs.",
              },
            ];
          }
        } catch (e) {
          console.error("[AgentRunWorkflow] Onboarding check failed:", e);
        }
      }

      const modelMessages = await convertToModelMessages(uiMessages);

      // Load Composio tools — optional, continue without if unavailable
      let composioTools: Record<string, unknown> = {};
      try {
        const session = await composio.create(userId, { manageConnections: true });
        composioTools = await session.tools();
      } catch (err) {
        console.error("[AgentRunWorkflow] Composio tools unavailable:", err);
      }

      const tools = {
        ...composioTools,
        getWeather,
        saveMemory: saveMemory({ userId }),
        recallMemory: recallMemory({ userId }),
        updateMemory: updateMemory({ userId }),
        deleteMemory: deleteMemory({ userId }),
        setReminder: setReminder({ userId, baseUrl: BASE_URL }),
        setCronJob: setCronJob({ userId, baseUrl: BASE_URL }),
        listSchedules: listSchedules({ userId }),
        deleteSchedule: deleteSchedule(),
        setupTrigger: setupTrigger({ userId }),
        listActiveTriggers: listActiveTriggers({ userId }),
        removeTrigger: removeTrigger(),
        delegateToSubAgent: delegateToSubAgent({ userId, chatId, baseUrl: BASE_URL }),
        getSubAgentResult: getSubAgentResult({ userId }),
        listSubAgents: listSubAgents(),
        launchMission: launchMission({ userId, chatId, baseUrl: BASE_URL }),
        getMissionStatus: getMissionStatus({ userId }),
        tavilySearch,
        tavilyExtract,
        tavilyCrawl,
        tavilyMap,
        wikiQuery: wikiQuery(),
        wikiIngest: wikiIngest(),
        // New: Pass current workflow model to artifact tools
        createDocument: createDocument({
          session: { user: { id: userId } } as any,
          dataStream: { write: () => {} } as any, // Workflow handles storage via handlers
          modelId: model,
        }),
        updateDocument: updateDocument({
          session: { user: { id: userId } } as any,
          dataStream: { write: () => {} } as any,
          modelId: model,
        }),
        // Daytona Browser
        browserSetup: daytonaBrowserTools.browserSetup({ userId }),
        browserNavigate: daytonaBrowserTools.browserNavigate({ userId }),
        browserInteract: daytonaBrowserTools.browserInteract({ userId }),
        browserExtract: daytonaBrowserTools.browserExtract({ userId }),
        browserMultiTab: daytonaBrowserTools.browserMultiTab({ userId }),
        browserUploadFile: daytonaBrowserTools.browserUploadFile({ userId }),
        browserScreenshot: daytonaBrowserTools.browserScreenshot({ userId }),
        browserVisualInteract: daytonaBrowserTools.browserVisualInteract({ userId }),
        // Twilio
        twilioMakeCall: twilioTools.twilioMakeCall({ userId }),
        twilioGetCall: twilioTools.twilioGetCall({ userId }),
        twilioListCalls: twilioTools.twilioListCalls({ userId }),
        twilioModifyCall: twilioTools.twilioModifyCall({ userId }),
        twilioSendSMS: twilioTools.twilioSendSMS({ userId }),
        twilioGetMessage: twilioTools.twilioGetMessage({ userId }),
        twilioListMessages: twilioTools.twilioListMessages({ userId }),
        twilioListMyNumbers: twilioTools.twilioListMyNumbers({ userId }),
        twilioSearchAvailableNumbers: twilioTools.twilioSearchAvailableNumbers({ userId }),
        twilioProvisionNumber: twilioTools.twilioProvisionNumber({ userId }),
        twilioReleaseNumber: twilioTools.twilioReleaseNumber({ userId }),
        twilioUpdateNumber: twilioTools.twilioUpdateNumber({ userId }),
        upsertKnowledgeEntity: upsertKnowledgeEntity({ userId }),
        addKnowledgeRelation: addKnowledgeRelation({ userId }),
        getKnowledgeEntity: getKnowledgeEntity({ userId }),
        searchKnowledgeGraph: searchKnowledgeGraph({ userId }),
        deleteKnowledgeEntity: deleteKnowledgeEntity({ userId }),
        deleteKnowledgeRelation: deleteKnowledgeRelation({ userId }),
        addGoal: addGoal({ userId }),
        updateGoal: updateGoal({ userId }),
        logGoalProgress: logGoalProgress({ userId }),
        listGoals: listGoals({ userId }),
        deleteGoal: deleteGoal({ userId }),
      };

      const memorySection = memoryContext
        ? `\n\n═══════════════════════════════════\nUSER MEMORY (loaded from long-term store)\n═══════════════════════════════════\n${memoryContext}\n`
        : "";

      const systemPrompt = `${regularPrompt}${sessionTailPrompt([
        ...(sessionTail ?? []),
        ...onboardingTail,
      ])}${memorySection}\n\nToday is ${new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })}.`;

      // Mutable refs for onStepFinish — these accumulate across all model steps.
      let toolCallCount = 0;
      let currentTool: string | undefined;

      let currentStepSnapshot: WorkflowStep = { ...s };

      let text = "";
      try {
        const result = await generateText({
          model: getLanguageModel(model),
          system: systemPrompt,
          messages: modelMessages,
          tools,
          stopWhen: stepCountIs(25),
          onStepFinish: async ({ toolCalls }) => {
            if (toolCalls?.length) {
              toolCallCount += toolCalls.length;
              currentTool = toolCalls[toolCalls.length - 1]?.toolName;
              currentStepSnapshot = {
                ...currentStepSnapshot,
                toolCallCount,
                currentTool,
              };
              // Write live progress without blocking the model loop.
              // Fire-and-forget — upsert is idempotent so a failed write
              // on retry won't corrupt the card.
              void upsertWorkflowProgress({
                chatId, taskId, workflowRunId, task,
                steps: [step1, currentStepSnapshot],
                startedAt,
              }).catch((err) =>
                console.error("[AgentRunWorkflow] onStepFinish upsert error:", err),
              );
            }
          },
        });
        text = result.text;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[AgentRunWorkflow] generateText failed:", err);
        const failed = failStep(s, msg);
        await upsertWorkflowProgress({
          chatId, taskId, workflowRunId, task,
          steps: [step1, failed],
          overallStatus: "failed",
          startedAt,
        });
        await updateAgentTask({ id: taskId, userId, status: "failed", result: { error: msg } });
        throw err; // Let Upstash retry
      }

      const outputPreview = text.length > 280 ? `${text.slice(0, 280)}…` : text;
      const done = completeStep(s, { toolCallCount, output: outputPreview });
      await upsertWorkflowProgress({
        chatId, taskId, workflowRunId, task,
        steps: [step1, done],
        startedAt,
      });

      return { resultText: text, step2: done };
    },
  );

  // ── Step 3: finalize ───────────────────────────────────────────────────────
  await context.run("finalize", async () => {
    const finalStep: WorkflowStep = {
      stepIndex: 2,
      name: "finalize",
      label: "Complete",
      status: "completed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
    };

    // Mark workflow progress as done
    await upsertWorkflowProgress({
      chatId, taskId, workflowRunId, task,
      steps: [step1, step2, finalStep],
      overallStatus: "completed",
      startedAt,
    });

    // Persist the final answer as a clean, readable assistant message.
    // This is separate from the progress card so users can vote on it
    // and read it without the card scaffolding.
    if (resultText.trim()) {
      await saveMessages({
        messages: [
          {
            id: generateUUID(),
            chatId,
            role: "assistant",
            parts: [{ type: "text", text: resultText }],
            attachments: [],
            createdAt: new Date(Date.now() + 100), // ensure it sorts after the progress card
          } as DBMessage,
        ],
      });
    }

    // Mark AgentTask completed so the polling banner disappears.
    await updateAgentTask({
      id: taskId,
      userId,
      status: "completed",
      result: { text: resultText },
    });

    // Update session tail for cross-surface continuity
    const dbMessages = await getMessagesByChatId({ id: chatId });
    const uiMessages = convertToUIMessages(dbMessages);
    const tail = uiMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-5)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        text: getTextFromMessage(m),
      }));

    await saveSessionTail(userId, tail);
  });
});
