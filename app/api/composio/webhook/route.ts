/**
 * Composio webhook handler.
 *
 * Route: POST /api/composio/webhook/route.ts
 *
 * Verifies the signature, saves the event, returns 200 immediately.
 * Heavy AI processing → Upstash Workflow (survives Vercel timeout).
 * Mission event bridge → notifies waiting leadLifecycleWorkflow instances
 *   when a lead replies to outreach email, so they resume instantly.
 */

import { NextRequest, NextResponse } from "next/server";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { generateText, stepCountIs } from "ai";
import { getGoogleModel, getLanguageModel } from "@/lib/ai/providers";
import {
  getChatsByUserId,
  saveMessages,
  saveEvent,
  updateEventStatus,
} from "@/lib/db/queries";
import { getWeather } from "@/lib/ai/tools/get-weather";
import {
  saveMemory,
  recallMemory,
  updateMemory,
  deleteMemory,
} from "@/lib/ai/tools/memory";
import { generateUUID } from "@/lib/utils";
import { SUPPORTED_TRIGGERS } from "@/lib/ai/triggers";
import {
  isWorkflowEnabled,
  triggerComposioWebhookWorkflow,
  getWorkflowClient,
} from "@/lib/workflow/client";

const composio = new Composio({ provider: new VercelProvider() });

// ── Mission Event Bridge ──────────────────────────────────────────────────────
// When a lead replies to an outreach email, we notify the leadLifecycleWorkflow
// that is paused at context.waitForEvent for that exact email address.
// The workflow wakes up instantly and drafts the reply.

async function tryNotifyMissionBridge(
  userId: string,
  triggerSlug: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!isWorkflowEnabled()) return;

  const workflowClient = getWorkflowClient();
  if (!workflowClient) return;

  // ── Email reply → wake up paused lead sequence ────────────────────────────
  if (triggerSlug === "GMAIL_NEW_GMAIL_MESSAGE") {
    const fromRaw = payload?.from ?? (payload as any)?.sender ?? "";
    const emailFrom = typeof fromRaw === "string"
      ? fromRaw.toLowerCase()
      : (fromRaw as any)?.email?.toLowerCase() ?? "";
    const subject = (payload?.subject as string) ?? "";
    const isReply =
      subject.toLowerCase().startsWith("re:") ||
      subject.toLowerCase().startsWith("re ");

    if (isReply && emailFrom) {
      try {
        // Broadcast via userId-scoped key — the lead workflow's waitForEvent
        // listens on `lead-reply:{missionId}:{email}`. We also try the
        // userId-scoped key so we don't need to know missionId at webhook time.
        await (workflowClient as any).notify({
          eventId: `lead-reply-${userId}-${emailFrom.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`,
          eventData: {
            from: emailFrom,
            subject,
            body: (payload?.body ?? payload?.snippet ?? "") as string,
            timestamp: new Date().toISOString(),
          },
        });
        console.log(`[MissionBridge] Notified lead workflow for reply from ${emailFrom}`);
      } catch (e) {
        console.error("[MissionBridge] notify failed:", e);
      }
    }
  }

  // ── Stripe churn → wake up any paused churn defense workflow ─────────────
  if (
    triggerSlug === "STRIPE_CHARGE_FAILED_TRIGGER" ||
    triggerSlug === "STRIPE_PAYMENT_FAILED_TRIGGER" ||
    triggerSlug === "STRIPE_SUBSCRIPTION_DELETED_TRIGGER"
  ) {
    const customerId =
      (payload?.customer as string) ?? (payload?.customerId as string);
    if (customerId) {
      try {
        await (workflowClient as any).notify({
          eventId: `stripe-event-${userId}-${customerId.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`,
          eventData: { triggerSlug, payload, timestamp: new Date().toISOString() },
        });
      } catch {
        // non-fatal
      }
    }
  }
}

export async function POST(req: NextRequest) {
  console.log("[Composio Webhook] POST received");

  try {
    const rawBody = await req.text();
    const webhookId =
      req.headers.get("x-composio-webhook-id") ||
      req.headers.get("webhook-id");
    const signature =
      req.headers.get("x-composio-signature") ||
      req.headers.get("webhook-signature");
    const timestampHeader =
      req.headers.get("x-composio-webhook-timestamp") ||
      req.headers.get("webhook-timestamp");

    if (!signature || !webhookId || !timestampHeader) {
      console.error("[Composio Webhook] Missing required headers.");
      return NextResponse.json({ error: "Missing webhook headers" }, { status: 401 });
    }

    const secret = process.env.COMPOSIO_WEBHOOK_SECRET;
    const skipVerification = req.headers.get("x-skip-verification") === "true";

    let triggerSlug: string;
    let userId: string;
    let payload: Record<string, unknown>;

    if (!secret || skipVerification) {
      console.warn(
        `[Composio Webhook] Skipping verification (${skipVerification ? "x-skip-verification" : "no secret"}) — DEV ONLY`
      );
      const eventData = JSON.parse(rawBody);
      userId =
        eventData.metadata?.user_id || eventData.userId || eventData.user_id;
      triggerSlug =
        eventData.metadata?.trigger_slug ||
        eventData.triggerSlug ||
        eventData.trigger_name;
      payload = eventData.data || eventData.payload || eventData;
    } else {
      try {
        await (composio.triggers as any).verifyWebhook({
          id: webhookId,
          payload: rawBody,
          signature,
          timestamp: timestampHeader,
          secret,
        });

        const eventData = JSON.parse(rawBody);
        userId =
          eventData.userId ||
          eventData.clientUserId ||
          eventData.metadata?.user_id ||
          eventData.metadata?.client_user_id ||
          eventData.user_id;
        triggerSlug =
          eventData.triggerSlug ||
          eventData.triggerName ||
          eventData.metadata?.trigger_slug ||
          eventData.metadata?.trigger_name ||
          eventData.trigger_slug;
        payload = eventData.payload || eventData.data || eventData;

        console.log(
          `[Composio Webhook] Verified. Trigger: ${triggerSlug}, User: ${userId}`
        );
      } catch (verificationError) {
        console.error("[Composio Webhook] Signature verification failed:", verificationError);
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    if (!userId || !triggerSlug) {
      console.error(
        `[Composio Webhook] Missing identity. UserID: ${userId}, Trigger: ${triggerSlug}`
      );
      return NextResponse.json({ error: "Missing identity data" }, { status: 400 });
    }

    // ── Fire-and-forget: wake up any paused mission workflows ────────────────
    // Do this before saving the event so lead sequences resume ASAP.
    void tryNotifyMissionBridge(userId, triggerSlug, payload);

    // ── Persist event (always inline — fast) ─────────────────────────────────
    const savedEvents = await saveEvent({ userId, triggerSlug, payload });
    const savedEvent = savedEvents[0];

    // ── Find active chat ──────────────────────────────────────────────────────
    const { chats } = await getChatsByUserId({
      id: userId,
      limit: 1,
      startingAfter: null,
      endingBefore: null,
    });
    const activeChat = chats[0];

    if (!activeChat) {
      if (savedEvent) {
        await updateEventStatus({ id: savedEvent.id, status: "failed" });
      }
      return NextResponse.json({ ok: true, message: "Event logged, no active chat found" });
    }

    const chatId = activeChat.id;
    const eventId = savedEvent?.id;

    // ── Offload AI processing to Workflow if available ────────────────────────
    if (isWorkflowEnabled() && eventId) {
      try {
        const triggered = await triggerComposioWebhookWorkflow({
          userId,
          triggerSlug,
          payload,
          chatId,
          eventId,
        });
        if (triggered) {
          console.log(`[Composio Webhook] Workflow triggered: ${triggered.workflowRunId}`);
          return NextResponse.json({ ok: true, message: "Event queued for processing" });
        }
      } catch (e) {
        console.error("[Composio Webhook] Workflow trigger failed, falling back:", e);
      }
    }

    // ── Fallback: inline AI processing ───────────────────────────────────────
    let composioTools: Record<string, unknown> = {};
    try {
      const session = await composio.create(userId, { manageConnections: true });
      composioTools = await session.tools();
    } catch (e) {
      console.error("[Composio Webhook] Failed to load tools:", e);
    }

    const tools = {
      ...composioTools,
      getWeather,
      saveMemory: saveMemory({ userId }),
      recallMemory: recallMemory({ userId }),
      updateMemory: updateMemory({ userId }),
      deleteMemory: deleteMemory({ userId }),
    };

    const systemInstruction = `You are Etles, an elite, highly autonomous, and proactive AI executive assistant.
An external integration event has just triggered: "${triggerSlug}".
Event Payload: ${JSON.stringify(payload)}

YOUR PRIME DIRECTIVES:
1. ANALYSIS: Instantly process the payload to understand the context, sender, and urgency of the event.
2. ACTION: Proactively take the most helpful next step using your available tools. 
   - If it's an email: Draft a highly professional, context-aware reply if appropriate, or summarize it if it's informational.
   - If it's a Slack/Discord message: Draft a response or summarize the thread.
   - If it's a GitHub PR/Issue: Summarize the changes or draft a comment.
3. SAFETY & APPROVALS: Do NOT send irreversible outward communication (like sending an email or posting a public message) without the user's explicit consent, unless the user has given you prior blanket approval. Instead, save it as a draft or stage the action, and notify the user.
4. NOTIFICATION: Always leave a concise, formatted message in the user's chat detailing what happened and what action you took (or drafted) on their behalf.
5. TONE: Be direct, highly competent, concise, and professional. Do not use filler words.

Today's date is ${new Date().toLocaleDateString()}. Execute your duties flawlessly.`;

    const result = await generateText({
      model: getGoogleModel("gemini-2.5-flash"),
      system: systemInstruction,
      prompt: `Event: ${triggerSlug}. Context: ${JSON.stringify(payload)}`,
      tools,
      stopWhen: stepCountIs(25),
    });

    const messagesToSave: Parameters<typeof saveMessages>[0]["messages"] = [];
    const timestamp = new Date();
    const triggerDef = SUPPORTED_TRIGGERS.find(
      (t) => t.slug.toLowerCase() === triggerSlug.toLowerCase()
    );

    const eventPayload = {
      slug: triggerSlug,
      app: triggerDef?.app || "app",
      summary: triggerDef?.name || `Event: ${triggerSlug}`,
      payload,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    messagesToSave.push({
      id: generateUUID(),
      chatId,
      role: "user",
      parts: [{ type: "text", text: `###EVENT_TRIGGERED###${JSON.stringify(eventPayload)}` }],
      attachments: [],
      createdAt: timestamp,
    });

    if (result.text?.trim()) {
      messagesToSave.push({
        id: generateUUID(),
        chatId,
        role: "assistant",
        parts: [{ type: "text", text: result.text }],
        attachments: [],
        createdAt: new Date(timestamp.getTime() + 1000),
      });
    }

    for (const step of result.steps ?? []) {
      for (const tc of step.toolCalls ?? []) {
        const toolCallId = (tc as any).toolCallId;
        messagesToSave.push({
          id: generateUUID(),
          chatId,
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              toolCallId,
              toolName: (tc as any).toolName,
              args: (tc as any).args,
            },
          ],
          attachments: [],
          createdAt: new Date(timestamp.getTime() + 2000),
        });

        const toolResult = step.toolResults?.find(
          (r: any) => r.toolCallId === toolCallId
        );
        if (toolResult) {
          messagesToSave.push({
            id: generateUUID(),
            chatId,
            role: "tool",
            parts: [
              {
                type: "tool-result",
                toolCallId,
                toolName: (toolResult as any).toolName,
                result: (toolResult as any).result,
              },
            ],
            attachments: [],
            createdAt: new Date(timestamp.getTime() + 3000),
          });
        }
      }
    }

    await saveMessages({ messages: messagesToSave });
    if (savedEvent) {
      await updateEventStatus({ id: savedEvent.id, status: "processed" });
    }

    return NextResponse.json({ ok: true, message: "Event processed" });
  } catch (error: unknown) {
    console.error("[Composio Webhook] Failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}