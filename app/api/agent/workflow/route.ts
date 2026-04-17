/**
 * app/api/agent/workflow/route.ts
 *
 * Durable Upstash Workflow endpoint for sub-agent execution.
 *
 * UPDATED: Now reads `parentEventId` from the payload and notifies
 * the parent workflow via the A2A bus when the task completes.
 * This enables parent agents to use context.waitForEvent() for A2A collaboration.
 */

import { serve } from "@upstash/workflow/nextjs";
import { runSubAgent } from "@/lib/agent/subagent-runner";
import { updateAgentTask } from "@/lib/db/queries";
import type { WorkflowTriggerPayload } from "@/lib/workflow/client";
import { notifyParentAgent } from "@/lib/agent/agent-bus";

export const maxDuration = 300;

export const { POST } = serve<WorkflowTriggerPayload>(async (context) => {
  const payload = context.requestPayload;
  const { taskId, userId, chatId, agentType, task } = payload;

  // parentEventId is present when this agent was spawned by another agent (A2A)
  const parentEventId = (payload as any).parentEventId as string | undefined;

  const result = await context.run("run-sub-agent", async () => {
    return await runSubAgent({
      taskId,
      userId,
      chatId,
      agentType,
      task,
    });
  });

  // ── A2A notification: wake the parent workflow ────────────────────────────
  if (parentEventId) {
    await context.run("notify-parent", async () => {
      await notifyParentAgent(
        parentEventId,
        {
          taskId,
          agentType,
          success: result.success,
          text: result.text,
          error: result.error,
          completedAt: new Date().toISOString(),
        },
        // No parent workflowRunId available here — Upstash lookback
        // handles the race condition via the eventId alone
        undefined,
      );
    });
  }

  return {
    success: result.success,
    taskId,
    error: result.error,
  };
});