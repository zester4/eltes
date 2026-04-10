// app/(chat)/api/triggers/webhook/route.ts
//
// This is the endpoint you register in Composio as your webhook URL.
// It is SEPARATE from /api/triggers (which is the management API for listing
// and creating trigger subscriptions).
//
// Flow: Composio fires → this handler → resolves user → resolves routes →
//        runs matched sub-agents → saves results to the user's active chat.

import { NextRequest, NextResponse } from "next/server";
import { generateText, stepCountIs } from "ai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { getLanguageModel } from "@/lib/ai/providers";
import { getSubAgentBySlug } from "@/lib/agent/subagent-definitions";
import { resolveRoutes, buildTaskPrompt, isTriggerRouted } from "@/lib/ai/trigger-routing";
import { getChatsByUserId, saveMessages } from "@/lib/db/queries";
import { getWeather } from "@/lib/ai/tools/get-weather";
import {
  saveMemory,
  recallMemory,
  updateMemory,
  deleteMemory,
} from "@/lib/ai/tools/memory";
import {
  twilioMakeCall,
  twilioSendSMS,
  twilioListMyNumbers,
  twilioGetCall,
  twilioGetMessage,
} from "@/lib/ai/tools/twilio";
import { setReminder, setCronJob, listSchedules, deleteSchedule } from "@/lib/ai/tools/schedule";
import { generateUUID } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const COMPOSIO_WEBHOOK_SECRET = process.env.COMPOSIO_WEBHOOK_SECRET ?? "";
const MODEL = "google/gemini-3-flash";

// ─────────────────────────────────────────────────────────────────────────────
// Composio webhook payload shape
// ─────────────────────────────────────────────────────────────────────────────

interface ComposioWebhookPayload {
  /** e.g. "STRIPE_CHARGE_FAILED_TRIGGER" */
  triggerName: string;
  /** Composio connected account ID — used to resolve our internal userId */
  connectedAccountId: string;
  /** Raw event data from the upstream integration */
  data: Record<string, any>;
  /** Optional metadata */
  triggerId?: string;
  appName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signature verification
// ─────────────────────────────────────────────────────────────────────────────

async function verifySignature(req: NextRequest, rawBody: string): Promise<boolean> {
  if (!COMPOSIO_WEBHOOK_SECRET) {
    console.warn("[Webhook] COMPOSIO_WEBHOOK_SECRET not set — skipping verification.");
    return true;
  }

  const signature = req.headers.get("x-composio-signature") ?? "";
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(COMPOSIO_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const sigBytes = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(rawBody));
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve userId from connectedAccountId via Composio
// ─────────────────────────────────────────────────────────────────────────────

async function resolveUserId(connectedAccountId: string): Promise<string | null> {
  try {
    const composio = new Composio({ provider: new VercelProvider() });
    const account = await composio.connectedAccounts.get(connectedAccountId);
    return (account as any)?.clientUniqueUserId ?? (account as any)?.entityId ?? null;
  } catch (e) {
    console.error("[Webhook] Failed to resolve userId from connectedAccountId:", e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve most-recent chat for a user
// ─────────────────────────────────────────────────────────────────────────────

async function resolveActiveChatId(userId: string): Promise<string | null> {
  const { chats } = await getChatsByUserId({
    id: userId,
    limit: 1,
    startingAfter: null,
    endingBefore: null,
  });
  return chats[0]?.id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution context wrapper appended to every sub-agent system prompt
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(agentSystemPrompt: string, triggerName: string): string {
  return `${agentSystemPrompt}

═══════════════════════════════════════════
EXECUTION CONTEXT
═══════════════════════════════════════════
• Mode: AUTONOMOUS — you were triggered by a live integration event, not a user message.
• Trigger: ${triggerName}
• Current date/time: ${new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}
• The user is not present. They will read your output later.

PRIME DIRECTIVE:
Do not ask clarifying questions. Do not defer. Execute completely based on your role above.
Use your tools. Take action. Leave the user a concise, confident summary of exactly what was done.
If an action requires explicit user approval per your role instructions, draft it clearly and flag it — do not execute it.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Run a single sub-agent route and persist the result to chat
// ─────────────────────────────────────────────────────────────────────────────

async function runAgentRoute(
  userId: string,
  chatId: string,
  agentSlug: string,
  taskPrompt: string,
  triggerName: string
): Promise<void> {
  const agent = getSubAgentBySlug(agentSlug);
  if (!agent) {
    console.error(`[Webhook] Unknown agent slug: "${agentSlug}"`);
    return;
  }

  // Load Composio tools for this user (toolkit filtering done at the router level)
  let composioTools: Record<string, any> = {};
  try {
    const composio = new Composio({ provider: new VercelProvider() });
    const session = await composio.create(userId, { manageConnections: true });
    composioTools = await session.tools();
  } catch (e) {
    console.error(`[Webhook] Failed to load Composio tools for agent "${agentSlug}":`, e);
  }

  const tools = {
    ...composioTools,
    getWeather,
    saveMemory: saveMemory({ userId }),
    recallMemory: recallMemory({ userId }),
    updateMemory: updateMemory({ userId }),
    deleteMemory: deleteMemory({ userId }),
  };

  console.log(`[Webhook] Running agent "${agentSlug}" | trigger: ${triggerName} | user: ${userId}`);

  const result = await generateText({
    model: getLanguageModel(MODEL),
    system: buildSystemPrompt(agent.systemPrompt, triggerName),
    prompt: taskPrompt,
    tools,
    stopWhen: stepCountIs(25),
  });

  // ── Persist interaction to chat ─────────────────────────────────────────────
  const messagesToSave: any[] = [];
  const timestamp = new Date();

  // Trigger event as the "user" turn so it appears in the chat timeline
  messagesToSave.push({
    id: generateUUID(),
    chatId,
    role: "user",
    parts: [{ type: "text", text: `[Trigger: ${triggerName}]\n\n${taskPrompt}` }],
    attachments: [],
    createdAt: timestamp,
  });

  // Agent's final text response
  if (result.text) {
    messagesToSave.push({
      id: generateUUID(),
      chatId,
      role: "assistant",
      parts: [{ type: "text", text: result.text }],
      attachments: [],
      createdAt: new Date(timestamp.getTime() + 1_000),
    });
  }

  // Tool calls and results interleaved from each step — tool-call and
  // tool-result are merged into a single assistant message per step.
  // The AI SDK UIMessage schema has no "tool" role.
  if (result.steps) {
    let offset = 2_000;
    for (const step of result.steps) {
      if (!step.toolCalls?.length) continue;
      for (const call of step.toolCalls) {
        const toolCallId = call.toolCallId;
        const toolResult = step.toolResults?.find((r: any) => r.toolCallId === toolCallId);

        const parts: any[] = [
          {
            type: "tool-call",
            toolCallId,
            toolName: (call as any).toolName,
            args: (call as any).args,
          },
        ];

        if (toolResult) {
          parts.push({
            type: "tool-result",
            toolCallId,
            toolName: (call as any).toolName,
            result: (toolResult as any).result,
          });
        }

        messagesToSave.push({
          id: generateUUID(),
          chatId,
          role: "assistant",
          parts,
          attachments: [],
          createdAt: new Date(timestamp.getTime() + offset),
        });

        offset += 1_000;
      }
    }
  }

  await saveMessages({ messages: messagesToSave });

  console.log(
    `[Webhook] Agent "${agentSlug}" done — ` +
    `tools used: ${result.toolCalls?.length ?? 0}, ` +
    `response: ${result.text?.length ?? 0} chars`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Composio webhook receiver
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Read raw body before any parsing (signature needs the raw bytes)
  const rawBody = await req.text();

  // 2. Verify the request came from Composio
  const isValid = await verifySignature(req, rawBody);
  if (!isValid) {
    console.warn("[Webhook] Signature verification failed — request rejected.");
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  // 3. Parse payload
  let payload: ComposioWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { triggerName, connectedAccountId, data } = payload;

  if (!triggerName || !connectedAccountId) {
    return NextResponse.json(
      { ok: false, error: "Missing triggerName or connectedAccountId" },
      { status: 400 }
    );
  }

  // 4. Short-circuit if we have no routes for this trigger
  //    Return 200 so Composio doesn't retry an intentionally-unhandled event.
  if (!isTriggerRouted(triggerName)) {
    console.log(`[Webhook] No routes for "${triggerName}" — ignoring.`);
    return NextResponse.json({ ok: true, message: "No routes registered for this trigger." });
  }

  // 5. Resolve user from the connected account
  const userId = await resolveUserId(connectedAccountId);
  if (!userId) {
    console.warn(`[Webhook] Could not resolve userId for connectedAccountId "${connectedAccountId}".`);
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  // 6. Resolve the user's active chat
  let chatId: string;
  try {
    const resolved = await resolveActiveChatId(userId);
    if (!resolved) {
      console.warn(`[Webhook] No active chat for user ${userId}. Trigger "${triggerName}" dropped.`);
      return NextResponse.json({ ok: false, error: "No active chat found for user" });
    }
    chatId = resolved;
  } catch (e) {
    console.error("[Webhook] Failed to resolve chat:", e);
    return NextResponse.json({ ok: false, error: "Chat resolution failed" }, { status: 500 });
  }

  // 7. Split routes by priority
  const routes = resolveRoutes(triggerName);
  const immediateRoutes = routes.filter((r) => r.priority === "immediate");
  const queuedRoutes = routes.filter((r) => r.priority === "queued");

  const results: { agentSlug: string; status: "ok" | "error"; error?: string }[] = [];

  // Immediate routes run serially so tool calls don't race on shared resources
  for (const route of immediateRoutes) {
    const taskPrompt = buildTaskPrompt(route, data, triggerName);
    try {
      await runAgentRoute(userId, chatId, route.agentSlug, taskPrompt, triggerName);
      results.push({ agentSlug: route.agentSlug, status: "ok" });
    } catch (e: any) {
      console.error(`[Webhook] Immediate agent "${route.agentSlug}" failed:`, e);
      results.push({ agentSlug: route.agentSlug, status: "error", error: e.message });
    }
  }

  // Queued routes are non-blocking — use waitUntil so the response returns fast.
  // For production durability, replace this with a QStash publish to a
  // dedicated worker route (same pattern as your /api/scheduled handler).
  for (const route of queuedRoutes) {
    const taskPrompt = buildTaskPrompt(route, data, triggerName);
    const background = runAgentRoute(userId, chatId, route.agentSlug, taskPrompt, triggerName)
      .catch((e) => console.error(`[Webhook] Queued agent "${route.agentSlug}" failed:`, e));

    // Vercel / Next.js edge runtime — keep the process alive for the background task
    (req as any).context?.waitUntil?.(background);

    results.push({ agentSlug: route.agentSlug, status: "ok" });
  }

  return NextResponse.json({
    ok: true,
    trigger: triggerName,
    userId,
    chatId,
    routesExecuted: results,
  });
}