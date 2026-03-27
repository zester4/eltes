import { Redis } from "@upstash/redis";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

export type PendingApproval = {
  draftId: string;
  type: string;              // "email" | "payment" | "post" | "task" | "generic"
  summary: string;           // human-readable description
  executionTool: string;     // composio tool name to call on approval
  executionInput: Record<string, unknown>;  // args for the tool
  editPrompt?: string;       // if present, shown to user on "Edit"
  chatId: string;
  telegramChatId: number;
  messageId: number | null;  // Telegram message_id of the approval card
};

export function approvalKey(draftId: string) {
  return `approval:${draftId}`;
}

export async function storePendingApproval(
  approval: Omit<PendingApproval, "messageId">,
  messageId: number | null
): Promise<void> {
  if (!redis) return;
  await redis.set(
    approvalKey(approval.draftId),
    JSON.stringify({ ...approval, messageId }),
    { ex: 60 * 60 * 24 } // 24 hour TTL
  );
}
