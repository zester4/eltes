//app/api/agent/workflow/route.ts
import { serve } from "@upstash/workflow/nextjs";
import { runSubAgent } from "@/lib/agent/subagent-runner";
import { updateAgentTask } from "@/lib/db/queries";
import { notifyWorkflow, type WorkflowTriggerPayload } from "@/lib/workflow/client";

export const maxDuration = 300;

export const { POST } = serve<WorkflowTriggerPayload>(async (context) => {
  const payload = context.requestPayload;
  const { taskId, userId, chatId, agentType, task, orchestrationId } = payload;

  const result = await context.run("run-sub-agent", async () => {
    return await runSubAgent({
      taskId,
      userId,
      chatId,
      agentType,
      task,
    });
  });

  // If this sub-agent was spawned as part of a multi-agent orchestration,
  // notify the orchestrator's waitForEvent so it can proceed.
  if (orchestrationId) {
    await context.run("notify-orchestrator", async () => {
      await notifyWorkflow(
        `orch-${orchestrationId}-${agentType}-done`,
        {
          taskId,
          agentType,
          success: result.success,
          text: (result as { text?: string }).text ?? "",
          error: result.error,
        },
      );
    });
  }

  return {
    success: result.success,
    taskId,
    error: result.error,
  };
});
