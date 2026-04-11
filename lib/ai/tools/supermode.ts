/**
 * SuperMode Tools — Start, Stop, Status
 *
 * These are injected into the main chat agent. The user can say things like:
 * "start supermode: get me 50 beta users by end of month"
 * "stop supermode"
 * "what's supermode doing?"
 *
 * File location: lib/ai/tools/supermode.ts
 */

import { tool } from "ai";
import { z } from "zod";
import {
  getActiveSupermodeSessionByUserId,
  getSupermodeActions,
  getSupermodeSessionsByUserId,
  updateSupermodeSession,
} from "@/lib/db/queries";
import { cancelWorkflow } from "@/lib/workflow/client";
import { startSupermodeSession } from "@/lib/supermode/start-session";

export const startSupermode = ({
  userId,
  chatId,
}: {
  userId: string;
  chatId: string;
}) =>
  tool({
    description:
      "Activate SuperMode — Etles's fully autonomous operation mode. " +
      "Etles works independently toward your objective without waiting for commands. " +
      "It uses all available tools (Composio apps, sub-agents, scheduling, web research, memory) " +
      "and asks for your approval via Telegram before any irreversible action. " +
      "You can watch every step in real-time and stop it any time. " +
      "Use for goals that require sustained, multi-step autonomous work: " +
      "'get us 50 beta users', 'run our entire SDR pipeline this week', " +
      "'monitor competitors and respond to any news about us', " +
      "'handle all my inbox while I'm traveling'. " +
      "Only one SuperMode session can be active at a time.",
    inputSchema: z.object({
      objective: z
        .string()
        .min(20)
        .describe(
          "The specific, measurable goal for Etles to achieve. Be precise: include what success looks like, any constraints, and the timeframe. Example: 'Find 30 SaaS founders who raised seed in the last 90 days, send them a personalised cold email about Etles, and book at least 3 demo calls by end of this week.'",
        ),
      maxSteps: z
        .number()
        .min(5)
        .max(50)
        .default(25)
        .optional()
        .describe(
          "Maximum number of autonomous steps before pausing for review. Default: 25. Each step is one specific action.",
        ),
    }),

    execute: async ({ objective, maxSteps = 25 }) => {
      const result = await startSupermodeSession({
        userId,
        chatId,
        objective,
        maxSteps,
      });

      if (!result.ok) {
        if (result.code === "already_active") {
          return {
            success: false,
            message: result.message,
            existingSessionId: result.existingSessionId,
          };
        }
        return {
          success: false,
          message: result.message,
        };
      }

      return {
        success: true,
        sessionId: result.sessionId,
        workflowRunId: result.workflowRunId ?? undefined,
        message:
          `🚀 **SuperMode activated.** I'm now working autonomously on:\n\n> ${objective}\n\n` +
          `I'll take up to ${maxSteps} steps and ask for your approval via Telegram before any irreversible action. ` +
          `You can watch every step in real-time at the SuperMode feed, or ask me "what is supermode doing?" at any time. ` +
          `Say "stop supermode" to cancel.`,
      };
    },
  });

export const stopSupermode = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Stop the currently active SuperMode session. Etles will stop taking autonomous actions immediately. All work done so far is preserved in the activity feed.",
    inputSchema: z.object({
      confirm: z
        .boolean()
        .describe("Must be true to confirm cancellation"),
    }),

    execute: async ({ confirm }) => {
      if (!confirm) {
        return {
          success: false,
          message: "Cancellation not confirmed. Pass confirm: true to stop SuperMode.",
        };
      }

      const active = await getActiveSupermodeSessionByUserId(userId);
      if (!active) {
        return {
          success: false,
          message: "No active SuperMode session found.",
        };
      }

      // Cancel the Upstash Workflow run
      if (active.workflowRunId) {
        try {
          await cancelWorkflow(active.workflowRunId);
        } catch (err) {
          console.error("[stopSupermode] Failed to cancel workflow:", err);
        }
      }

      await updateSupermodeSession({
        id: active.id,
        status: "cancelled",
        completedAt: new Date(),
        result: { achieved: false, summary: "Cancelled by user" },
      });

      return {
        success: true,
        sessionId: active.id,
        message: `SuperMode stopped. I've completed ${active.currentStep} steps toward: "${active.objective.slice(0, 100)}". Check the activity feed for a full log of what was done.`,
      };
    },
  });

export const getSupermodeStatus = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Check the current status of the SuperMode autonomous agent. Returns the active session details and the most recent actions taken.",
    inputSchema: z.object({}),

    execute: async () => {
      const active = await getActiveSupermodeSessionByUserId(userId);

      if (!active) {
        const recent = await getSupermodeSessionsByUserId(userId, 3);
        if (recent.length === 0) {
          return {
            active: false,
            message: "No SuperMode sessions found. Use startSupermode to begin.",
          };
        }
        const last = recent[0];
        return {
          active: false,
          lastSession: {
            id: last.id,
            objective: last.objective,
            status: last.status,
            steps: last.currentStep,
            completedAt: last.completedAt,
          },
          message: `No active session. Last session (${last.status}): "${last.objective.slice(0, 100)}"`,
        };
      }

      // Get last 5 actions for the status report
      const recentActions = await getSupermodeActions(active.id, 5);
      const actionSummaries = recentActions.map((a) => ({
        step: a.stepIndex,
        type: a.actionType,
        summary: a.summary ?? a.reasoning ?? "(no summary)",
        tool: a.toolName,
        at: a.createdAt,
      }));

      return {
        active: true,
        sessionId: active.id,
        objective: active.objective,
        status: active.status,
        currentStep: active.currentStep,
        maxSteps: active.maxSteps,
        progress: `${active.currentStep}/${active.maxSteps} steps`,
        recentActions: actionSummaries,
        message:
          active.status === "awaiting_approval"
            ? `SuperMode is paused — awaiting your approval on Telegram for step ${active.currentStep}.`
            : `SuperMode is running (step ${active.currentStep}/${active.maxSteps}). Last action: "${recentActions.at(-1)?.summary ?? "initializing…"}"`,
      };
    },
  });