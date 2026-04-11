/**
 * SuperMode Autonomous Workflow
 * Route: POST /api/agent/supermode
 *
 * Architecture mirrors the Telegram workflow exactly:
 *   Step 1 — setup: load context, session tail, build system prompt
 *   Step 2 — execute: ONE generateText call with stopWhen:stepCountIs.
 *             The AI SDK loop IS the agent loop. onStepFinish writes the
 *             live activity feed as every tool call completes.
 *   Step 3 — save-notify: persist to chat, update session, send Telegram
 *
 * Key design decisions:
 * - getGoogleModel (direct, no gateway) — same as Telegram/subagent-runner
 * - systemPrompt() from prompts.ts augmented with SuperMode context
 * - markComplete tool signals objective achieved → AI stops calling tools
 * - queueApproval reused for irreversible actions — no reinventing HITL
 * - onStepFinish is non-fatal: DB write failures never abort the AI loop
 * - No per-step generateObject/decision schema — that was the bug
 *
 * File location: app/api/agent/supermode/route.ts
 */

import { serve } from "@upstash/workflow/nextjs";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { Redis } from "@upstash/redis";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";

import { getGoogleModel } from "@/lib/ai/providers";
import { systemPrompt } from "@/lib/ai/prompts";
import { getSessionTail, saveSessionTail } from "@/lib/session-tail";

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
import { orchestrateAgents } from "@/lib/ai/tools/orchestrate";
import { queueApproval } from "@/lib/ai/tools/queue-approval";
import {
  tavilySearch,
  tavilyExtract,
  tavilyCrawl,
  tavilyMap,
} from "@/lib/ai/tools/tavily-search";
import * as daytonaTools from "@/lib/ai/tools/daytona";
import * as browserUseTools from "@/lib/ai/tools/browser-use";
import * as daytonaBrowserTools from "@/lib/ai/tools/daytona-browser";

import {
  getBotIntegration,
  getMessagesByChatId,
  saveMessages,
  updateSupermodeSession,
  createSupermodeAction,
} from "@/lib/db/queries";
import { sendLongMessage } from "@/lib/telegram/api";
import { generateUUID } from "@/lib/utils";
import type { SupermodeWorkflowPayload } from "@/lib/workflow/client";

export const maxDuration = 300;

const composio = new Composio({ provider: new VercelProvider() });

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const BASE_URL =
  process.env.BASE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined) ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

// ── markComplete — the AI calls this to signal it is finished ────────────────
// After this call, the AI produces a final text response with no more tool
// calls, and stopWhen fires naturally on the next step count check.
function buildMarkCompleteTool() {
  return tool({
    description:
      "Call this ONLY when the SuperMode objective is fully achieved, OR when you have determined it genuinely cannot be completed with the tools available. After calling this, write your final summary as a text response — do not call any more tools.",
    inputSchema: z.object({
      achieved: z
        .boolean()
        .describe(
          "true if the objective was successfully achieved, false if it could not be done",
        ),
      summary: z
        .string()
        .min(50)
        .describe(
          "Detailed summary of everything that was done, found, sent, or created. This is shown directly to the user as the SuperMode report.",
        ),
    }),
    execute: async ({ achieved, summary }) => ({
      achieved,
      summary,
      completedAt: new Date().toISOString(),
    }),
  });
}

// ── Main workflow ─────────────────────────────────────────────────────────────

export const { POST } = serve<SupermodeWorkflowPayload>(async (context) => {
  const { sessionId, userId, chatId, objective, maxSteps } =
    context.requestPayload;

  // ── Step 1: Setup — load context, build the real system prompt ────────────
  const setupResult = await context.run("setup", async () => {
    await updateSupermodeSession({ id: sessionId, status: "running" });

    await createSupermodeAction({
      sessionId,
      userId,
      stepIndex: 0,
      actionType: "planning",
      summary: `SuperMode activated. Objective: ${objective.slice(0, 300)}`,
      requiresApproval: false,
    }).catch(() => {
      /* non-fatal */
    });

    // Load the last 8 messages from this chat as conversation context
    // Gives SuperMode continuity with what the user was discussing
    const dbMessages = await getMessagesByChatId({ id: chatId });
    const history = dbMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-8)
      .map((m) => {
        const textPart = (
          m.parts as { type: string; text?: string }[]
        ).find((p) => p.type === "text");
        return {
          role: m.role as "user" | "assistant",
          content: textPart?.text ?? "",
        };
      })
      .filter((m) => m.content.length > 0);

    // Load session tail — same as Telegram workflow
    const sessionTail = await getSessionTail(userId);

    // Build the REAL system prompt using prompts.ts — no custom prompt divergence
    const basePrompt = systemPrompt({
      selectedChatModel: "google/gemini-2.5-flash",
      requestHints: {
        latitude: undefined,
        longitude: undefined,
        city: undefined,
        country: undefined,
      },
      sessionTail,
      skipArtifacts: true,
    });

    return { history, basePrompt };
  });

  // ── Build SuperMode-augmented system prompt ───────────────────────────────
  // Pure JS — not a context.run step, just string concatenation.
  // Appended after the full base prompt so all tool knowledge is preserved.
  const supermodeSystem = `${setupResult.basePrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUPERMODE — FULLY AUTONOMOUS EXECUTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You are Etles operating in SuperMode. The user has given you a goal and stepped away. You are fully autonomous. No human is available to answer questions or give guidance. Use every tool at your disposal.

YOUR OBJECTIVE:
"${objective}"

HOW TO OPERATE:
• Start by calling recallMemory to surface any relevant context about the user, their business, preferences, and past work.
• Work step by step toward the objective. Never pause to ask for clarification — make the best decision with available information and proceed.
• For complex sub-tasks, use delegateToSubAgent to spawn specialized agents rather than doing everything yourself.
• For problems that benefit from multiple specialists working simultaneously, use orchestrateAgents for parallel execution.
• Use tavilySearch for any real-time research, news, or web intelligence.
• When the objective is fully achieved OR you determine it cannot be completed, call markComplete with a detailed summary, then write your final response. Do not call any more tools after markComplete.

APPROVAL RULES — STRICTLY ENFORCED:
SAFE (execute immediately, no approval needed):
  Reading emails, calendars, documents. Web research. Saving/recalling memory. Creating drafts. Delegating to sub-agents. Scheduling reminders. Checking statuses. Running code in sandboxes. Browsing the web.

REQUIRES APPROVAL (call queueApproval FIRST — do NOT call the actual sending/payment/deletion tool):
  Sending emails or messages to real people. Posting to social media. Making payments or financial transfers. Deleting records. Creating calendar events that send invitations to others. Publishing anything publicly.

When you call queueApproval, the user receives a Telegram notification to approve or reject. Continue working on other parts of the objective while waiting.

Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  // ── Step 2: Execute — the full autonomous agent loop ─────────────────────
  // This is ONE context.run step. generateText with stopWhen:stepCountIs
  // handles all tool calls internally. This IS the agent loop — no manual
  // iteration at the workflow level.
  const executionResult = await context.run("execute", async () => {
    // Load Composio tools — same pattern as subagent-runner and Telegram workflow
    let composioTools: Record<string, unknown> = {};
    try {
      const session = await composio.create(userId, { manageConnections: true });
      composioTools = await session.tools();
    } catch (e) {
      console.error("[SuperMode] Composio tools failed:", e);
    }

    let currentStepIndex = 0;
    let completionData: { achieved: boolean; summary: string } | null = null;

    const allTools = {
      ...composioTools,

      // SuperMode termination signal
      markComplete: buildMarkCompleteTool(),

      // Core tools
      getWeather,

      // HITL approval gate — reuses the existing queue-approval system
      // irreversible actions go through this, not directly to the tool
      queueApproval: queueApproval({ userId, chatId, skipTelegram: false }),

      // Memory
      saveMemory: saveMemory({ userId }),
      recallMemory: recallMemory({ userId }),
      updateMemory: updateMemory({ userId }),
      deleteMemory: deleteMemory({ userId }),

      // Scheduling
      setReminder: setReminder({ userId, baseUrl: BASE_URL }),
      setCronJob: setCronJob({ userId, baseUrl: BASE_URL }),
      listSchedules: listSchedules({ userId }),
      deleteSchedule: deleteSchedule(),

      // Composio event triggers
      setupTrigger: setupTrigger({ userId }),
      listActiveTriggers: listActiveTriggers({ userId }),
      removeTrigger: removeTrigger(),

      // Sub-agent delegation
      delegateToSubAgent: delegateToSubAgent({
        userId,
        chatId,
        baseUrl: BASE_URL,
      }),
      getSubAgentResult: getSubAgentResult({ userId }),
      listSubAgents: listSubAgents(),

      // Multi-agent orchestration
      orchestrateAgents: orchestrateAgents({ userId, chatId }),

      // Web research (Tavily)
      tavilySearch,
      tavilyExtract,
      tavilyCrawl,
      tavilyMap,

      // Daytona sandbox
      createSandbox: daytonaTools.createSandbox({ userId }),
      listSandboxes: daytonaTools.listSandboxes({ userId }),
      deleteSandbox: daytonaTools.deleteSandbox({ userId }),
      executeCommand: daytonaTools.executeCommand({ userId }),
      runCode: daytonaTools.runCode({ userId }),
      listFiles: daytonaTools.listFiles({ userId }),
      readFile: daytonaTools.readFile({ userId }),
      writeFile: daytonaTools.writeFile({ userId }),
      createDirectory: daytonaTools.createDirectory({ userId }),
      searchFiles: daytonaTools.searchFiles({ userId }),
      replaceInFiles: daytonaTools.replaceInFiles({ userId }),
      gitClone: daytonaTools.gitClone({ userId }),
      gitStatus: daytonaTools.gitStatus({ userId }),
      gitCommit: daytonaTools.gitCommit({ userId }),
      gitPush: daytonaTools.gitPush({ userId }),
      gitPull: daytonaTools.gitPull({ userId }),
      gitBranch: daytonaTools.gitBranch({ userId }),
      getPreviewLink: daytonaTools.getPreviewLink({ userId }),
      runBackgroundProcess: daytonaTools.runBackgroundProcess({ userId }),
      lspDiagnostics: daytonaTools.lspDiagnostics({ userId }),
      archiveSandbox: daytonaTools.archiveSandbox({ userId }),

      // Browser automation
      browserUseRunTask: browserUseTools.browserUseRunTask(),
      browserUseStartTask: browserUseTools.browserUseStartTask(),
      browserUseGetTask: browserUseTools.browserUseGetTask(),
      browserUseControlTask: browserUseTools.browserUseControlTask(),
      browserUseCreateSession: browserUseTools.browserUseCreateSession(),
      browserUseGetLiveUrl: browserUseTools.browserUseGetLiveUrl(),
      browserUseListTasks: browserUseTools.browserUseListTasks(),
      browserUseCheckCredits: browserUseTools.browserUseCheckCredits(),
      browserSetup: daytonaBrowserTools.browserSetup({ userId }),
      browserNavigate: daytonaBrowserTools.browserNavigate({ userId }),
      browserInteract: daytonaBrowserTools.browserInteract({ userId }),
      browserExtract: daytonaBrowserTools.browserExtract({ userId }),
      browserMultiTab: daytonaBrowserTools.browserMultiTab({ userId }),
      browserUploadFile: daytonaBrowserTools.browserUploadFile({ userId }),
      browserScreenshot: daytonaBrowserTools.browserScreenshot({ userId }),
      browserVisualInteract: daytonaBrowserTools.browserVisualInteract({
        userId,
      }),
    };

    const { text, steps } = await generateText({
      model: getGoogleModel("google/gemini-2.5-flash"),
      system: supermodeSystem,
      messages: [
        // Conversation history gives context continuity
        ...setupResult.history,
        // The autonomous execution trigger as the final user turn
        {
          role: "user" as const,
          content: `You are now in SuperMode. Execute this objective autonomously: ${objective}`,
        },
      ],
      tools: allTools as any,

      // THE CORRECT STOP CONDITION — matches Telegram workflow and subagent-runner
      // The AI SDK handles all tool call rounds internally until:
      //   (a) the AI produces a final response with no tool calls, OR
      //   (b) stepCountIs(maxSteps) fires
      // The AI is instructed to call markComplete before (a), giving us
      // a clean structured completion signal.
      stopWhen: stepCountIs(maxSteps),

      // onStepFinish fires after every tool-call round.
      // Writes to the live activity feed. Errors are non-fatal.
      onStepFinish: async ({ toolCalls, toolResults }) => {
        currentStepIndex++;

        try {
          await updateSupermodeSession({
            id: sessionId,
            currentStep: currentStepIndex,
          });

          for (const tc of toolCalls ?? []) {
            const result = (toolResults ?? []).find(
              (r) => r.toolCallId === tc.toolCallId,
            );

            // Capture markComplete data so we have it after generateText returns
            if (tc.toolName === "markComplete" && result) {
              const r = (
                result as {
                  result?: { achieved?: boolean; summary?: string };
                }
              ).result;
              completionData = {
                achieved: r?.achieved ?? true,
                summary: r?.summary ?? "",
              };
            }

            await createSupermodeAction({
              sessionId,
              userId,
              stepIndex: currentStepIndex,
              actionType: "tool_call",
              toolName: tc.toolName,
              toolInput: (tc as { args?: unknown }).args ?? null,
              toolOutput: result
                ? (result as { result?: unknown }).result ?? null
                : null,
              summary: `Called ${tc.toolName}`,
              requiresApproval: false,
            });
          }
        } catch (err) {
          // Activity feed write failure MUST NOT abort the AI execution
          console.error("[SuperMode] onStepFinish write failed (non-fatal):", err);
        }
      },
    });

    // Serialise all tool call parts for DB persistence (same as subagent-runner)
    const toolCallParts = steps.flatMap((s) =>
      (s.toolCalls ?? []).map((tc) => ({
        type: "tool-call" as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: (tc as { args?: unknown }).args,
      })),
    );

    return {
      resultText: text,
      stepsCompleted: currentStepIndex,
      toolCallParts,
      completionData,
      wasExplicitlyCompleted: completionData !== null,
    };
  });

  // ── Step 3: Save results and notify user ──────────────────────────────────
  await context.run("save-notify", async () => {
    const {
      resultText,
      stepsCompleted,
      toolCallParts,
      completionData,
      wasExplicitlyCompleted,
    } = executionResult;

    const achieved = completionData?.achieved ?? true;
    // Prefer the structured markComplete summary; fall back to the final text
    const finalSummary =
      completionData?.summary && completionData.summary.length > 20
        ? completionData.summary
        : resultText;

    // Update session to completed
    await updateSupermodeSession({
      id: sessionId,
      status: "completed",
      completedAt: new Date(),
      currentStep: stepsCompleted,
      result: {
        achieved,
        summary: finalSummary,
        steps: stepsCompleted,
        explicitCompletion: wasExplicitlyCompleted,
      },
    });

    // Log completion to activity feed
    await createSupermodeAction({
      sessionId,
      userId,
      stepIndex: stepsCompleted + 1,
      actionType: "completed",
      summary: wasExplicitlyCompleted
        ? `${achieved ? "✅ Objective achieved" : "⚠️ Could not complete"} — ${stepsCompleted} steps`
        : `🏁 Step limit reached — ${stepsCompleted} steps`,
      requiresApproval: false,
    }).catch(() => {});

    // Build the chat message
    const statusIcon = achieved ? "✅" : "⚠️";
    const headline = wasExplicitlyCompleted
      ? `## ${statusIcon} SuperMode Complete`
      : `## 🏁 SuperMode — Step Limit Reached`;

    const chatMessage =
      `${headline}\n\n` +
      `**Objective:** ${objective}\n\n` +
      `${finalSummary}\n\n` +
      `*${stepsCompleted} steps executed.*`;

    // Save to chat — includes tool call parts so the UI can render them
    await saveMessages({
      messages: [
        {
          id: generateUUID(),
          chatId,
          role: "assistant",
          parts: [
            { type: "text", text: chatMessage },
            ...toolCallParts,
          ],
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    // Update session tail for next conversation context continuity
    await saveSessionTail(userId, [
      { role: "assistant", text: chatMessage },
    ]).catch(() => {});

    // Send Telegram notification — same pattern as Telegram workflow
    try {
      const integration = await getBotIntegration({ userId, platform: "telegram" });
      if (integration && redis) {
        const telegramChatId = await redis.get<number>(`tg:chatid:${userId}`);
        if (telegramChatId) {
          const tgSummary = finalSummary.slice(0, 500);
          await sendLongMessage(
            integration.botToken,
            telegramChatId,
            `🤖 <b>SuperMode Complete</b>\n\n` +
              `${achieved ? "✅ Objective achieved" : "⚠️ Partial"} — ${stepsCompleted} steps.\n\n` +
              `${tgSummary}${finalSummary.length > 500 ? "…" : ""}\n\n` +
              `<i>Full activity log is in your Etles chat.</i>`,
          );
        }
      }
    } catch (e) {
      console.error("[SuperMode] Telegram notification failed (non-fatal):", e);
    }
  });
});