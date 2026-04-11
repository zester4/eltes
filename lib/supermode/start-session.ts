import {
  createSupermodeSession,
  getActiveSupermodeSessionByUserId,
  updateSupermodeSession,
} from "@/lib/db/queries";
import {
  isWorkflowEnabled,
  triggerSupermodeWorkflow,
} from "@/lib/workflow/client";
import { generateUUID } from "@/lib/utils";

export type StartSupermodeSessionResult =
  | { ok: true; sessionId: string; workflowRunId: string | null }
  | {
      ok: false;
      code: "already_active" | "workflow_disabled" | "trigger_failed";
      message: string;
      existingSessionId?: string;
    };

export async function startSupermodeSession(params: {
  userId: string;
  chatId: string;
  objective: string;
  maxSteps?: number;
}): Promise<StartSupermodeSessionResult> {
  const { userId, chatId, objective, maxSteps = 25 } = params;
  const trimmed = objective.trim();

  const existing = await getActiveSupermodeSessionByUserId(userId);
  if (existing) {
    return {
      ok: false,
      code: "already_active",
      message: `SuperMode is already active (Session ${existing.id.slice(0, 8)}…) working on: "${existing.objective.slice(0, 100)}". Stop it first with stopSupermode if you want to start a new session.`,
      existingSessionId: existing.id,
    };
  }

  if (!isWorkflowEnabled()) {
    return {
      ok: false,
      code: "workflow_disabled",
      message:
        "SuperMode requires Upstash Workflow (QSTASH_TOKEN + BASE_URL). Please configure these environment variables.",
    };
  }

  const sessionId = generateUUID();

  await createSupermodeSession({
    id: sessionId,
    userId,
    chatId,
    objective: trimmed,
    maxSteps,
  });

  try {
    const result = await triggerSupermodeWorkflow({
      sessionId,
      userId,
      chatId,
      objective: trimmed,
      maxSteps,
    });

    if (result?.workflowRunId) {
      await updateSupermodeSession({
        id: sessionId,
        workflowRunId: result.workflowRunId,
      });
    }

    return {
      ok: true,
      sessionId,
      workflowRunId: result?.workflowRunId ?? null,
    };
  } catch (err) {
    await updateSupermodeSession({ id: sessionId, status: "failed" });
    return {
      ok: false,
      code: "trigger_failed",
      message:
        err instanceof Error ? err.message : "Failed to start SuperMode workflow",
    };
  }
}
