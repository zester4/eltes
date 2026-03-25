/**
 * Composio webhook handler.
 *
 * Route: POST /api/composio/webhook
 *
 * Verifies the signature, saves the event, and returns 200 immediately.
 * The heavy AI processing is offloaded to an Upstash Workflow run so it
 * survives any Vercel serverless timeout.
 * Falls back to inline generateText() if Workflow is not configured.
 */

import { NextRequest, NextResponse } from "next/server";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { generateText, stepCountIs } from "ai";
import { getLanguageModel } from "@/lib/ai/providers";
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
} from "@/lib/workflow/client";

const composio = new Composio({ provider: new VercelProvider() });

export async function POST(req: NextRequest) {
  console.log("[Composio Webhook] >>> POST request received at /api/composio/webhook");

  try {
    const rawBody = await req.text();
    console.log("[Composio Webhook] Raw body length:", rawBody.length);

    const webhookId =
      req.headers.get("x-composio-webhook-id") || req.headers.get("webhook-id");
    const signature =
      req.headers.get("x-composio-signature") || req.headers.get("webhook-signature");
    const timestampHeader =
      req.headers.get("x-composio-webhook-timestamp") ||
      req.headers.get("webhook-timestamp");

    if (!signature || !webhookId || !timestampHeader) {
      console.error("[Composio Webhook] ERROR: Missing required headers.");
      return NextResponse.json({ error: "Missing webhook headers" }, { status: 401 });
    }

    const secret = process.env.COMPOSIO_WEBHOOK_SECRET;
    const skipVerification = req.headers.get("x-skip-verification") === "true";

    let triggerSlug: string;
    let userId: string;
    let payload: any;

    if (!secret || skipVerification) {
      console.warn(
        `[Composio Webhook] WARNING: ${skipVerification ? "x-skip-verification is true" : "COMPOSIO_WEBHOOK_SECRET not set"}. Skipping verification (DEV ONLY)`,
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
          `[Composio Webhook] SUCCESS: Verified. Trigger: ${triggerSlug}, User: ${userId}`,
        );
      } catch (verificationError) {
        console.error("[Composio Webhook] Signature verification failed:", verificationError);
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    if (!userId || !triggerSlug) {
      console.error(
        `[Composio Webhook] Missing identity data. UserID: ${userId}, Trigger: ${triggerSlug}`,
      );
      return NextResponse.json({ error: "Missing identity data" }, { status: 400 });
    }

    // ── Persist event (fast, always inline) ──────────────────────────────────
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
      return NextResponse.json({
        ok: true,
        message: "Event logged, no active chat found",
      });
    }

    const chatId = activeChat.id;
    const eventId = savedEvent?.id;

    // ── Offload AI to Workflow if enabled ─────────────────────────────────────
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
          console.log(
            `[Composio Webhook] Workflow triggered: ${triggered.workflowRunId}`,
          );
          return NextResponse.json({ ok: true, message: "Event queued for processing" });
        }
      } catch (e) {
        console.error("[Composio Webhook] Failed to trigger workflow, falling back:", e);
      }
    }

    // ── Fallback: run AI inline (original behaviour) ──────────────────────────
    let composioTools: Record<string, any> = {};
    try {
      const session = await composio.create(userId);
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

    const systemInstruction = `You are Etles, the user's proactive AI assistant.
An external event has just occurred: "${triggerSlug}".
Payload data: ${JSON.stringify(payload)}

Your goal is to process this event immediately.
If the event is important, notify the user in their chat.
If you can take helpful action, do so using your tools.
Today's date is ${new Date().toLocaleDateString()}.
Be direct, helpful, and concise.`;

    const result = await generateText({
      model: getLanguageModel("google/gemini-2.5-flash"),
      system: systemInstruction,
      prompt: `Event triggered: ${triggerSlug}. Context: ${JSON.stringify(payload)}`,
      tools,
      stopWhen: stepCountIs(10),
    });

    const messagesToSave: any[] = [];
    const timestamp = new Date();
    const triggerDef = SUPPORTED_TRIGGERS.find(
      (t: any) => t.slug.toLowerCase() === triggerSlug.toLowerCase(),
    );

    const eventPayload = {
      slug: triggerSlug,
      app: triggerDef?.app || "app",
      summary: triggerDef?.name || `Event: ${triggerSlug}`,
      payload,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    messagesToSave.push({
      id: generateUUID(),
      chatId,
      role: "user",
      parts: [
        {
          type: "text",
          text: `###EVENT_TRIGGERED###${JSON.stringify(eventPayload)}`,
        },
      ],
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
        const toolCallId = tc.toolCallId;
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
          (r: any) => r.toolCallId === toolCallId,
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
                toolName: (tc as any).toolName,
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
  } catch (error: any) {
    console.error("[Composio Webhook] Failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}