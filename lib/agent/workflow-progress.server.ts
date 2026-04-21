/**
 * lib/agent/workflow-progress.server.ts
 *
 * Server-only DB write helper for the /agent workflow progress card.
 *
 * ⚠️  Do NOT import this file from client components. Use
 *     lib/agent/workflow-progress.ts for shared types and helpers.
 */

import "server-only";

import type { DBMessage } from "@/lib/db/schema";
import { upsertMessages } from "@/lib/db/queries";
import {
  encodeWorkflowProgress,
  workflowProgressMessageId,
  type WorkflowProgress,
  type WorkflowStep,
  type WorkflowOverallStatus,
} from "@/lib/agent/workflow-progress";

// Re-export the options interface so callers have a single import point.
export interface UpsertWorkflowProgressOptions {
  chatId: string;
  taskId: string;
  workflowRunId: string;
  task: string;
  steps: WorkflowStep[];
  overallStatus?: WorkflowOverallStatus;
  startedAt: string;
}

/**
 * Idempotent write: creates or overwrites the workflow progress card message.
 * Safe to call multiple times — uses `upsertMessages` which does
 * `ON CONFLICT (id) DO UPDATE SET parts = excluded.parts`.
 */
export async function upsertWorkflowProgress({
  chatId,
  taskId,
  workflowRunId,
  task,
  steps,
  overallStatus = "running",
  startedAt,
}: UpsertWorkflowProgressOptions): Promise<void> {
  const progress: WorkflowProgress = {
    taskId,
    workflowRunId,
    task,
    steps,
    overallStatus,
    startedAt,
    completedAt: overallStatus !== "running" ? new Date().toISOString() : undefined,
  };

  await upsertMessages({
    messages: [
      {
        id: workflowProgressMessageId(taskId),
        chatId,
        role: "assistant",
        parts: [{ type: "text", text: encodeWorkflowProgress(progress) }],
        attachments: [],
        createdAt: new Date(startedAt),
      } as DBMessage,
    ],
  });
}
