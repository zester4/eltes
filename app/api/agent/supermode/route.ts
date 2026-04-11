/**
 * SuperMode Autonomous Workflow
 * Route: POST /api/agent/supermode
 *
 * Runs Etles as a fully autonomous agent loop toward a user objective.
 * Each step: decide next action → check if approval required → execute → log.
 * Uses context.waitForEvent() for approval gates so the workflow truly pauses
 * (zero compute, zero cost) until the user responds on Telegram.
 *
 * File location: app/api/agent/supermode/route.ts
 */

import { serve } from "@upstash/workflow/nextjs";
import { generateText, generateObject, stepCountIs } from "ai";
import { z } from "zod";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { getGoogleModel } from "@/lib/ai/providers";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
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
  listSubAgents,
  getSubAgentResult,
} from "@/lib/ai/tools/subagents";
import {
  updateSupermodeSession,
  createSupermodeAction,
  getSupermodeActions,
  getSupermodeSessionById,
  saveMessages,
} from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";
import type { SupermodeWorkflowPayload } from "@/lib/workflow/client";
import { tool } from "ai";
import { sendLongMessage } from "@/lib/telegram/api";
import { getBotIntegration } from "@/lib/db/queries";
import { Redis } from "@upstash/redis";

export const maxDuration = 300;

const composio = new Composio({ provider: new VercelProvider() });

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// ── Decision schema ───────────────────────────────────────────────────────────
const DecisionSchema = z.object({
  reasoning: z
    .string()
    .describe("Your internal reasoning about the current state and next action"),
  summary: z
    .string()
    .describe("One-sentence description of what you are about to do"),
  isComplete: z
    .boolean()
    .describe("True if the objective has been fully achieved or is unreachable"),
  completionSummary: z
    .string()
    .optional()
    .describe("If isComplete, what was accomplished"),
  requiresApproval: z
    .boolean()
    .describe(
      "True if the next action is irreversible (sending emails, posting publicly, payments, etc.)",
    ),
  approvalDescription: z
    .string()
    .optional()
    .describe("If requiresApproval, describe exactly what you want to do"),
  toolName: z
    .string()
    .nullable()
    .describe("The exact tool name to call next, or null if complete"),
  toolArgs: z
    .record(z.unknown())
    .nullable()
    .describe("Arguments to pass to the tool"),
});

// ── Approval tools (signal intent, never block) ───────────────────────────────
function buildMarkCompleteSignal() {
  return tool({
    description:
      "Signal that the objective is fully complete. Call when done.",
    inputSchema: z.object({
      summary: z.string().describe("Summary of what was accomplished"),
      achieved: z.boolean().describe("Whether the objective was achieved"),
    }),
    execute: async ({ summary, achieved }) => ({ summary, achieved }),
  });
}

// ── System prompt builder ─────────────────────────────────────────────────────
function buildPlannerPrompt(objective: string): string {
  return `You are Etles in planning mode for a SuperMode autonomous session.

OBJECTIVE: ${objective}

Your job is to create a clear, step-by-step execution plan to achieve this objective using the tools available to you. The plan should be:
1. Specific and actionable (each step should map to one or two tool calls)
2. Ordered correctly (dependencies accounted for)
3. Realistic given available integrations (Composio tools, memory, sub-agents, scheduling)

Return a structured plan as JSON with:
{
  "steps": [
    { "stepNumber": 1, "description": "...", "toolHint": "tool to likely use" }
  ],
  "estimatedSteps": number,
  "strategy": "brief description of overall approach"
}`;
}

function buildDecisionPrompt(
  objective: string,
  plan: unknown,
  historyText: string,
  step: number,
  maxSteps: number,
): string {
  return `You are Etles running autonomously in SuperMode.

OBJECTIVE: ${objective}

EXECUTION PLAN:
${JSON.stringify(plan, null, 2)}

PROGRESS SO FAR (recent actions):
${historyText || "No actions taken yet. This is step 1."}

CURRENT STEP: ${step + 1} of ${maxSteps} maximum

Decide your next specific action. Be decisive. Do not ask for information — act.

IRREVERSIBLE ACTIONS (requiresApproval = true): sending emails, posting to social media, making payments, deleting records, creating calendar events, sending Slack messages to others.

ALL OTHER ACTIONS: requiresApproval = false (reading, researching, saving memory, internal analysis, sub-agent delegation).

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;
}

function buildExecutorPrompt(
  decision: z.infer<typeof DecisionSchema>,
  step: number,
): string {
  return `You are Etles executing one specific action in SuperMode.

Your decided action:
- Tool: ${decision.toolName}
- Args: ${JSON.stringify(decision.toolArgs, null, 2)}
- Reasoning: ${decision.reasoning}

Call ONLY the ${decision.toolName} tool with the provided arguments. Do not call any other tools. Do not explain. Execute.

Step: ${step + 1}`;
}

// ── Telegram approval sender ──────────────────────────────────────────────────
async function sendTelegramApprovalForSupermode(
  userId: string,
  sessionId: string,
  step: number,
  description: string,
): Promise<void> {
  if (!redis) return;

  try {
    const integration = await getBotIntegration({ userId, platform: "telegram" });
    if (!integration) return;

    const telegramChatIdKey = `tg:chatid:${userId}`;
    const telegramChatId = await redis.get<number>(telegramChatIdKey);
    if (!telegramChatId) return;

    const message =
      `🔴 <b>SuperMode Approval Required</b>\n\n` +
      `<b>Proposed action (Step ${step + 1}):</b>\n${description}\n\n` +
      `This action is irreversible. Approve or reject:`;

    const approveData = `supermode_approve:${sessionId}:${step}`;
    const rejectData = `supermode_reject:${sessionId}:${step}`;

    await fetch(`https://api.telegram.org/bot${integration.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: message,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Approve", callback_data: approveData },
              { text: "❌ Reject", callback_data: rejectData },
            ],
          ],
        },
      }),
    });
  } catch (err) {
    console.error("[SuperMode] Failed to send Telegram approval:", err);
  }
}

// ── Main workflow ─────────────────────────────────────────────────────────────
export const { POST } = serve<SupermodeWorkflowPayload>(async (context) => {
  const { sessionId, userId, chatId, objective, maxSteps } =
    context.requestPayload;

  const baseUrl =
    process.env.BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");

  // ── Step 1: Create execution plan ─────────────────────────────────────────
  const plan = await context.run("plan", async () => {
    const { text } = await generateText({
      model: getGoogleModel(DEFAULT_CHAT_MODEL),
      system: buildPlannerPrompt(objective),
      prompt: "Create the execution plan.",
    });

    let parsedPlan: unknown = { strategy: text, steps: [] };
    try {
      const match = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
      if (match) {
        parsedPlan = JSON.parse(match[1] ?? match[0]);
      }
    } catch {
      // Keep raw text as plan if JSON parse fails
      parsedPlan = { strategy: text, steps: [] };
    }

    await updateSupermodeSession({ id: sessionId, status: "running", plan: parsedPlan });
    await createSupermodeAction({
      sessionId,
      userId,
      stepIndex: 0,
      actionType: "planning",
      summary: `Created execution plan: ${JSON.stringify(parsedPlan).slice(
        0,
        200
      )}`,
      reasoning: text,
      toolName: null,
      toolInput: null,
      toolOutput: null,
      requiresApproval: false,
    });

    return parsedPlan;
  });

  // ── Steps 2-N: Autonomous execution loop ──────────────────────────────────
  for (let step = 0; step < maxSteps; step++) {
    // Update current step counter
    await context.run(`update-step-${step}`, async () => {
      await updateSupermodeSession({ id: sessionId, currentStep: step });
    });

    // ── Decide: What to do next ────────────────────────────────────────────
    const decision = await context.run(`decide-${step}`, async () => {
      // Load recent history (last 8 actions) to give agent context
      const recentActions = await getSupermodeActions(sessionId, 8);
      const historyText = recentActions
        .map(
          (a) =>
            `[Step ${a.stepIndex}] ${a.actionType.toUpperCase()}: ${
              a.summary ?? a.reasoning ?? "(no summary)"
            }`
        )
        .join("\n");

      const { object } = await generateObject({
        model: getGoogleModel(DEFAULT_CHAT_MODEL),
        schema: DecisionSchema,
        system: buildDecisionPrompt(
          objective,
          plan,
          historyText,
          step,
          maxSteps
        ),
        prompt: "What is your next specific action?",
      });

      await createSupermodeAction({
        sessionId,
        userId,
        stepIndex: step,
        actionType: "reasoning",
        summary: object.summary,
        reasoning: object.reasoning,
        toolName: null,
        toolInput: null,
        toolOutput: null,
        requiresApproval: object.requiresApproval,
      });

      return object;
    });

    // ── Check for completion ───────────────────────────────────────────────
    if (decision.isComplete) {
      await context.run(`mark-complete-${step}`, async () => {
        await updateSupermodeSession({
          id: sessionId,
          status: "completed",
          completedAt: new Date(),
          result: {
            achieved: true,
            summary: decision.completionSummary ?? "Objective achieved",
            steps: step + 1,
          },
        });

        await createSupermodeAction({
          sessionId,
          userId,
          stepIndex: step,
          actionType: "completed",
          summary: decision.completionSummary ?? "Objective achieved",
          reasoning: null,
          toolName: null,
          toolInput: null,
          toolOutput: null,
          requiresApproval: false,
        });

        // Save completion message to chat
        await saveMessages({
          messages: [
            {
              id: generateUUID(),
              chatId,
              role: "assistant",
              parts: [
                {
                  type: "text",
                  text: `## ✅ SuperMode Complete\n\n**Objective:** ${objective}\n\n${decision.completionSummary ?? "Objective achieved successfully."}\n\n*Completed in ${step + 1} steps.*`,
                },
              ],
              attachments: [],
              createdAt: new Date(),
            },
          ],
        });
      });
      break; // Exit the loop
    }

    // ── Approval gate for irreversible actions ─────────────────────────────
    if (decision.requiresApproval) {
      await context.run(`request-approval-${step}`, async () => {
        await sendTelegramApprovalForSupermode(
          userId,
          sessionId,
          step,
          decision.approvalDescription ?? decision.summary,
        );
        await updateSupermodeSession({ id: sessionId, status: "awaiting_approval" });
        await createSupermodeAction({
          sessionId,
          userId,
          stepIndex: step,
          actionType: "approval_requested",
          summary: `Awaiting approval: ${
            decision.approvalDescription ?? decision.summary
          }`,
          reasoning: null,
          toolName: null,
          toolInput: null,
          toolOutput: null,
          requiresApproval: true,
        });
      });

      // Pause workflow until user responds (24h max, then skip)
      const { eventData, timeout } = await context.waitForEvent(
        `approval-gate-${step}`,
        `supermode-${sessionId}-step-${step}-approval`,
        { timeout: "24h" },
      );

      const approved =
        !timeout && (eventData as { approved?: boolean })?.approved === true;

      await context.run(`log-approval-${step}`, async () => {
        await createSupermodeAction({
          sessionId,
          userId,
          stepIndex: step,
          actionType: timeout ? "failed" : approved ? "approved" : "rejected",
          summary: timeout
            ? "Approval timed out after 24h — skipping this action"
            : approved
            ? "Approved by user"
            : "Rejected by user",
          reasoning: null,
          toolName: null,
          toolInput: null,
          toolOutput: null,
          requiresApproval: false,
        });
        await updateSupermodeSession({ id: sessionId, status: "running" });
      });

      if (!approved) {
        // Skip this action, continue loop
        await context.sleep(`skip-rest-${step}`, 2);
        continue;
      }
    }

    // ── Execute: Call the decided tool ─────────────────────────────────────
    if (decision.toolName) {
      await context.run(`execute-${step}`, async () => {
        let composioTools: Record<string, unknown> = {};
        try {
          const session = await composio.create(userId, { manageConnections: true });
          composioTools = await session.tools();
        } catch (e) {
          console.error("[SuperMode] Composio tools unavailable:", e);
        }

        const allTools = {
          ...composioTools,
          getWeather,
          markComplete: buildMarkCompleteSignal(),
          saveMemory: saveMemory({ userId }),
          recallMemory: recallMemory({ userId }),
          updateMemory: updateMemory({ userId }),
          deleteMemory: deleteMemory({ userId }),
          setReminder: setReminder({ userId, baseUrl }),
          setCronJob: setCronJob({ userId, baseUrl }),
          listSchedules: listSchedules({ userId }),
          deleteSchedule: deleteSchedule(),
          setupTrigger: setupTrigger({ userId }),
          listActiveTriggers: listActiveTriggers({ userId }),
          removeTrigger: removeTrigger(),
          delegateToSubAgent: delegateToSubAgent({ userId, chatId, baseUrl }),
          getSubAgentResult: getSubAgentResult({ userId }),
          listSubAgents: listSubAgents(),
        };

        const { toolCalls, toolResults, text } = await generateText({
          model: getGoogleModel(DEFAULT_CHAT_MODEL),
          system: buildExecutorPrompt(decision, step),
          prompt: `Execute the ${decision.toolName} tool now.`,
          tools: allTools as any,
          stopWhen: stepCountIs(2), // execute at most 2 tool calls per step
        });

        // Log each tool call to the activity feed
        for (const tc of toolCalls) {
          const result = toolResults?.find((r) => r.toolCallId === tc.toolCallId);
          await createSupermodeAction({
            sessionId,
            userId,
            stepIndex: step,
            actionType: "tool_call",
            toolName: tc.toolName,
            toolInput: (tc as any).args,
            toolOutput: result ? (result as any).result : null,
            summary: `Called ${tc.toolName}`,
            reasoning: null,
            requiresApproval: false,
          });
        }

        return { executed: toolCalls.length, text };
      });
    }

    // ── Rest between steps (keeps Upstash costs down) ─────────────────────
    if (step < maxSteps - 1) {
      await context.sleep(`rest-${step}`, 5);
    }
  }

  // ── Timeout / max steps reached ───────────────────────────────────────────
  await context.run("check-timeout", async () => {
    const session = await getSupermodeSessionById(sessionId);
    if (!session || session.status === "completed") return;

    await updateSupermodeSession({
      id: sessionId,
      status: "completed",
      completedAt: new Date(),
      result: {
        achieved: false,
        summary: `Reached maximum step limit (${maxSteps})`,
      },
    });

    await saveMessages({
      messages: [
        {
          id: generateUUID(),
          chatId,
          role: "assistant",
          parts: [
            {
              type: "text",
              text: `## ⚠️ SuperMode — Step Limit Reached\n\nI've completed ${maxSteps} autonomous steps toward: **${objective}**\n\nI've stopped to wait for your review. Check the SuperMode activity feed to see what was accomplished. You can start a new SuperMode session to continue.`,
            },
          ],
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });
  });
});