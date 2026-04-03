//lib/workflow/client.ts
import { Client } from "@upstash/workflow";

const token = process.env.QSTASH_TOKEN;
const appBaseUrl =
  process.env.BASE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined) ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

export function getWorkflowClient(): Client | null {
  if (!token) return null;
  return new Client({
    baseUrl: process.env.QSTASH_URL,
    token,
  });
}

export function isWorkflowEnabled(): boolean {
  return Boolean(token && appBaseUrl);
}
 
// ── Sub-agent workflow ────────────────────────────────────────────────────────
 
export type WorkflowTriggerPayload = {
  taskId: string;
  userId: string;
  chatId: string;
  agentType: string;
  task: string;
};
 
export async function triggerAgentWorkflow(
  payload: WorkflowTriggerPayload,
): Promise<{ workflowRunId: string } | null> {
  const client = getWorkflowClient();
  if (!client || !appBaseUrl) return null;
 
  const workflowUrl = `${appBaseUrl}/api/agent/workflow`;
  const failureUrl = `${appBaseUrl}/api/agent/workflow/failure`;
  const { workflowRunId } = await client.trigger({
    url: workflowUrl,
    body: payload,
    retries: 3,
    failureUrl,
  });
  return { workflowRunId };
}
 
// ── Subagent chat workflow ────────────────────────────────────────────────────

export type SubagentChatWorkflowPayload = {
  taskId: string;
  userId: string;
  agentSlug: string;
  chatId?: string;
};

export async function triggerSubagentChatWorkflow(
  payload: SubagentChatWorkflowPayload,
): Promise<{ workflowRunId: string } | null> {
  const client = getWorkflowClient();
  if (!client || !appBaseUrl) return null;

  const workflowUrl = `${appBaseUrl}/api/subagents/chat/workflow`;
  const failureUrl = `${appBaseUrl}/api/subagents/chat/workflow/failure`;
  const { workflowRunId } = await client.trigger({
    url: workflowUrl,
    body: payload,
    retries: 3,
    failureUrl,
  });
  return { workflowRunId };
}

// ── Telegram workflow ─────────────────────────────────────────────────────────
 
export type TelegramWorkflowPayload = {
  ownerUserId: string;
  botToken: string;
  telegramChatId: number;
  senderName: string;
  userText: string;
  baseUrl: string;
};
 
export async function triggerTelegramWorkflow(
  payload: TelegramWorkflowPayload,
): Promise<{ workflowRunId: string } | null> {
  const client = getWorkflowClient();
  if (!client || !appBaseUrl) return null;
 
  const { workflowRunId } = await client.trigger({
    url: `${appBaseUrl}/api/telegram/workflow`,
    body: payload,
    retries: 2,
  });
  return { workflowRunId };
}
 
// ── Composio webhook workflow ─────────────────────────────────────────────────
 
export type ComposioWebhookWorkflowPayload = {
  userId: string;
  triggerSlug: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  chatId: string;
  eventId: string;
};
 
export async function triggerComposioWebhookWorkflow(
  payload: ComposioWebhookWorkflowPayload,
): Promise<{ workflowRunId: string } | null> {
  const client = getWorkflowClient();
  if (!client || !appBaseUrl) return null;
 
  const { workflowRunId } = await client.trigger({
    url: `${appBaseUrl}/api/composio/workflow`,
    body: payload,
    retries: 2,
  });
  return { workflowRunId };
}
 
// ── Shared helpers ────────────────────────────────────────────────────────────
 
/** Upstash API supports lookback via workflowRunId; @upstash/workflow types may lag. */
type NotifyParams = {
  eventId: string;
  eventData?: unknown;
  workflowRunId?: string;
};
 
export async function notifyWorkflow(
  eventId: string,
  eventData: Record<string, unknown>,
  workflowRunId?: string,
): Promise<void> {
  const client = getWorkflowClient();
  if (!client) return;
 
  const notify = client.notify as (params: NotifyParams) => Promise<unknown>;
  await notify({
    eventId,
    eventData,
    ...(workflowRunId !== undefined ? { workflowRunId } : {}),
  });
}
 
export async function cancelWorkflow(workflowRunId: string): Promise<void> {
  const client = getWorkflowClient();
  if (!client) return;
 
  await client.cancel({ ids: workflowRunId });
}

// ── Heartbeat and Synthesis triggers ──────────────────────────────────────────

export async function triggerHeartbeatWorkflow(payload: { userId: string }): Promise<void> {
  const client = getWorkflowClient();
  if (!client || !appBaseUrl) return;

  await client.trigger({
    url: `${appBaseUrl}/api/agent/heartbeat/workflow`,
    body: payload,
    retries: 2,
  });
}

export async function triggerWeeklySynthesisWorkflow(payload: { userId: string }): Promise<void> {
  const client = getWorkflowClient();
  if (!client || !appBaseUrl) return;

  await client.trigger({
    url: `${appBaseUrl}/api/agent/heartbeat/synthesis`,
    body: payload,
    retries: 2,
  });
}

export async function registerUserCrons(userId: string): Promise<void> {
  const token = process.env.QSTASH_TOKEN;
  const qstashUrl = process.env.QSTASH_URL || "https://qstash.upstash.io";
  if (!token || !appBaseUrl) return;

  const heartbeatUrl = `${appBaseUrl}/api/agent/heartbeat`;

  // Hourly heartbeat: every hour at minute 0
  await fetch(`${qstashUrl}/v2/schedules`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      destination: heartbeatUrl,
      cron: "0 * * * *",
      scheduleId: `hb-${userId}`,
      body: JSON.stringify({ userId, type: "heartbeat" }),
    }),
  });

  // Weekly synthesis: every Monday at 8am UTC
  await fetch(`${qstashUrl}/v2/schedules`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      destination: heartbeatUrl,
      cron: "0 8 * * 1",
      scheduleId: `syn-${userId}`,
      body: JSON.stringify({ userId, type: "weekly_synthesis" }),
    }),
  });
}

export async function pauseUserCrons(userId: string): Promise<void> {
  const token = process.env.QSTASH_TOKEN;
  const qstashUrl = process.env.QSTASH_URL || "https://qstash.upstash.io";
  if (!token) return;

  await Promise.allSettled([
    fetch(`${qstashUrl}/v2/schedules/hb-${userId}/pause`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(`${qstashUrl}/v2/schedules/syn-${userId}/pause`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);
}

export async function resumeUserCrons(userId: string): Promise<void> {
  const token = process.env.QSTASH_TOKEN;
  const qstashUrl = process.env.QSTASH_URL || "https://qstash.upstash.io";
  if (!token) return;

  await Promise.allSettled([
    fetch(`${qstashUrl}/v2/schedules/hb-${userId}/resume`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(`${qstashUrl}/v2/schedules/syn-${userId}/resume`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);
}
 