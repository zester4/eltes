//app/api/agent/workflow/route.ts
import { serve } from "@upstash/workflow/nextjs";
import { runSubAgent } from "@/lib/agent/subagent-runner";
import { updateAgentTask } from "@/lib/db/queries";
import type { WorkflowTriggerPayload } from "@/lib/workflow/client";

export const maxDuration = 300;

export const { POST } = serve<WorkflowTriggerPayload>(async (context) => {
  const payload = context.requestPayload;
  const { taskId, userId, chatId, agentType, task } = payload;

  const result = await context.run("run-sub-agent", async () => {
    return await runSubAgent({
      taskId,
      userId,
      chatId,
      agentType,
      task,
    });
  });

  return {
    success: result.success,
    taskId,
    error: result.error,
  };
});
