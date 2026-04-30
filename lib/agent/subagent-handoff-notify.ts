/**
 * Fire-and-forget: asks the handoff API to append a proactive main-agent message.
 */
export function notifySubAgentHandoffToMainAgent(payload: {
  chatId?: string;
  userId: string;
  taskId: string;
  agentName: string;
  slug: string;
  task: string;
  outcome: "completed" | "failed";
  summary: string;
}): void {
  if (!payload.chatId) return;
  const rawBase =
    process.env.BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  
  const base = rawBase?.replace(/\/+$/, "") ?? "";
  if (!base) {
    return;
  }
  const secret = process.env.AGENT_DELEGATE_SECRET ?? "dev-internal";
  void fetch(`${base}/api/agent/handoff`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-secret": secret,
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    /* non-fatal */
  });
}
