/**
 * SuperMode Tools — startSupermode, stopSupermode, getSupermodeStatus
 *
 * Injected into the main chat agent. The user says things like:
 *   "start supermode: get me 50 beta users by end of the week"
 *   "stop supermode"
 *   "what is supermode doing right now?"
 *
 * File location: lib/ai/tools/supermode.ts
 */

import { tool } from "ai";
import { z } from "zod";
import {
  createSupermodeSession,
  updateSupermodeSession,
  getActiveSupermodeSessionByUserId,
  getSupermodeActions,
  getSupermodeSessionsByUserId,
} from "@/lib/db/queries";
import {
  isWorkflowEnabled,
  triggerSupermodeWorkflow,
  cancelWorkflow,
} from "@/lib/workflow/client";
import { generateUUID } from "@/lib/utils";

// ── startSupermode ─────────────────────────────────────────────────────────

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
      "Etles works independently toward your objective with no prompting required. " +
      "It uses all available tools (Composio 1000+ apps, sub-agents, web research, scheduling, memory, browser, sandboxes). " +
      "Before any irreversible action (sending emails, payments, public posts) it sends you a Telegram approval request. " +
      "You can monitor every step in real-time and stop it at any time. " +
      "Use for goals requiring sustained autonomous multi-step work: " +
      "'get us 50 beta users', 'run outbound this week', 'handle my inbox while I travel', " +
      "'research all our competitors and produce a full brief', 'build and deploy this feature'. " +
      "Only one SuperMode session can be active at a time.",
    inputSchema: z.object({
      objective: z
        .string()
        .min(20)
        .describe(
          "The specific, measurable goal for Etles to achieve autonomously. " +
            "Be precise: include what success looks like, constraints, and timeframe. " +
            "Example: 'Find 30 SaaS founders who raised seed in the last 90 days, research each one, " +
            "send them a personalised cold email about Etles, and book at least 3 demo calls by Friday.'",
        ),
      maxSteps: z
        .number()
        .int()
        .min(5)
        .max(50)
        .default(25)
        .optional()
        .describe(
          "Maximum autonomous steps before stopping. Each step is one tool call or reasoning action. Default: 25.",
        ),
    }),

    execute: async ({ objective, maxSteps = 25 }) => {
      // Block if there is already an active session
      const existing = await getActiveSupermodeSessionByUserId(userId);
      if (existing) {
        return {
          success: false,
          message:
            `SuperMode is already running (session ${existing.id.slice(0, 8)}…) ` +
            `on: "${existing.objective.slice(0, 100)}". ` +
            `Stop it first with stopSupermode before starting a new session.`,
          existingSessionId: existing.id,
        };
      }

      if (!isWorkflowEnabled()) {
        return {
          success: false,
          message:
            "SuperMode requires Upstash Workflow. Configure QSTASH_TOKEN and BASE_URL to enable it.",
        };
      }

      const sessionId = generateUUID();

      // Create the DB record first so the UI can show it immediately
      await createSupermodeSession({
        id: sessionId,
        userId,
        chatId,
        objective,
        maxSteps,
      });

      // Trigger the durable workflow — this returns in milliseconds,
      // the actual execution runs on Upstash infrastructure
      try {
        const result = await triggerSupermodeWorkflow({
          sessionId,
          userId,
          chatId,
          objective,
          maxSteps,
        });

        if (result?.workflowRunId) {
          // Store the workflowRunId so we can cancel it later
          await updateSupermodeSession({
            id: sessionId,
            workflowRunId: result.workflowRunId,
          });
        }

        return {
          success: true,
          sessionId,
          workflowRunId: result?.workflowRunId,
          message:
            `🚀 **SuperMode activated.**\n\n` +
            `Working autonomously on:\n> ${objective}\n\n` +
            `I'll take up to ${maxSteps} autonomous steps and send you a Telegram ` +
            `approval request before any irreversible action. ` +
            `You can track every step in real-time in the SuperMode feed, ` +
            `or ask me "what is supermode doing?" at any time. ` +
            `Say **stop supermode** to cancel.`,
        };
      } catch (err) {
        // Clean up if workflow trigger fails
        await updateSupermodeSession({ id: sessionId, status: "failed" }).catch(
          () => {},
        );
        return {
          success: false,
          sessionId,
          message: `Failed to start SuperMode: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });

// ── stopSupermode ──────────────────────────────────────────────────────────

export const stopSupermode = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Stop the currently active SuperMode session immediately. " +
      "All work done so far is preserved and visible in the activity feed.",
    inputSchema: z.object({
      confirm: z
        .boolean()
        .describe(
          "Must be true to confirm cancellation. Prevents accidental stops.",
        ),
    }),

    execute: async ({ confirm }) => {
      if (!confirm) {
        return {
          success: false,
          message:
            "Cancellation not confirmed. Pass confirm: true to stop SuperMode.",
        };
      }

      const active = await getActiveSupermodeSessionByUserId(userId);
      if (!active) {
        return {
          success: false,
          message: "No active SuperMode session found.",
        };
      }

      // Cancel the Upstash Workflow — stops all pending steps
      if (active.workflowRunId) {
        try {
          await cancelWorkflow(active.workflowRunId);
        } catch (err) {
          console.error("[stopSupermode] Workflow cancel failed:", err);
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
        message:
          `SuperMode stopped after ${active.currentStep} steps on: ` +
          `"${active.objective.slice(0, 100)}". ` +
          `Check the SuperMode activity feed for a full log of what was accomplished.`,
      };
    },
  });

// ── getSupermodeStatus ─────────────────────────────────────────────────────

export const getSupermodeStatus = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Check the current status of the SuperMode autonomous agent. " +
      "Returns the active session details and the most recent actions taken. " +
      "Use when the user asks 'what is supermode doing?', 'what has it done so far?', or 'is it still running?'",
    inputSchema: z.object({}),

    execute: async () => {
      const active = await getActiveSupermodeSessionByUserId(userId);

      if (!active) {
        // No active session — show last completed one for context
        const recent = await getSupermodeSessionsByUserId(userId, 3);
        if (recent.length === 0) {
          return {
            active: false,
            message:
              "No SuperMode sessions found. Use startSupermode to begin autonomous operation.",
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
          message:
            `No active session. Last session (${last.status}): ` +
            `"${last.objective.slice(0, 100)}" — ${last.currentStep} steps.`,
        };
      }

      // Get the last 5 actions for the status report
      const recentActions = await getSupermodeActions(active.id, 5);
      const actionSummaries = recentActions.map((a) => ({
        step: a.stepIndex,
        type: a.actionType,
        summary: a.summary ?? a.reasoning ?? "(no summary)",
        tool: a.toolName,
        at: a.createdAt,
      }));

      const statusLine =
        active.status === "awaiting_approval"
          ? `Paused — awaiting your Telegram approval for step ${active.currentStep}.`
          : active.status === "running"
            ? `Running — step ${active.currentStep} of ${active.maxSteps} maximum.`
            : `Status: ${active.status}`;

      return {
        active: true,
        sessionId: active.id,
        objective: active.objective,
        status: active.status,
        currentStep: active.currentStep,
        maxSteps: active.maxSteps,
        progress: `${active.currentStep}/${active.maxSteps}`,
        recentActions: actionSummaries,
        lastAction: recentActions.at(-1)?.summary ?? "initializing…",
        message: `${statusLine} Last action: "${recentActions.at(-1)?.summary ?? "initializing…"}"`,
      };
    },
  });