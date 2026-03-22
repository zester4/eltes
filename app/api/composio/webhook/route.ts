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

const composio = new Composio({ provider: new VercelProvider() });

export async function POST(req: NextRequest) {
  console.log("[Composio Webhook] >>> POST request received at /api/composio/webhook");
  try {
    const rawBody = await req.text();
    console.log("[Composio Webhook] Raw body length:", rawBody.length);
    console.log("[Composio Webhook] Headers:", JSON.stringify(Object.fromEntries(req.headers.entries()), null, 2));

    const webhookId = req.headers.get("x-composio-webhook-id") || req.headers.get("webhook-id");
    const signature = req.headers.get("x-composio-signature") || req.headers.get("webhook-signature");
    const timestampHeader = req.headers.get("x-composio-webhook-timestamp") || req.headers.get("webhook-timestamp");

    console.log(`[Composio Webhook] Extraction - ID: ${webhookId}, Signature: ${signature ? "Present" : "Missing"}, Timestamp: ${timestampHeader ? "Present" : "Missing"}`);

    if (!signature || !webhookId || !timestampHeader) {
      console.error("[Composio Webhook] ERROR: Missing required headers. Cannot proceed with verification.");
      return NextResponse.json({ error: "Missing webhook headers" }, { status: 401 });
    }

    const secret = process.env.COMPOSIO_WEBHOOK_SECRET;
    const skipVerification = req.headers.get("x-skip-verification") === "true";
    
    let triggerSlug: string;
    let userId: string;
    let payload: any;

    if (!secret || skipVerification) {
      console.warn(`[Composio Webhook] WARNING: ${skipVerification ? "x-skip-verification is true" : "COMPOSIO_WEBHOOK_SECRET is not set"}. Skipping verification (DEVELOPMENT ONLY)`);
      const eventData = JSON.parse(rawBody);
      userId = eventData.metadata?.user_id || eventData.userId || eventData.user_id;
      triggerSlug = eventData.metadata?.trigger_slug || eventData.triggerSlug || eventData.trigger_name;
      payload = eventData.data || eventData.payload || eventData;
    } else {
      try {
        await (composio.triggers as any).verifyWebhook({
          id: webhookId,
          payload: rawBody,
          signature: signature,
          timestamp: timestampHeader,
          secret: secret,
        });
        
        // After successful verification, parse properties from rawBody
        const eventData = JSON.parse(rawBody);
        
        userId = eventData.userId || eventData.clientUserId || eventData.metadata?.user_id || eventData.metadata?.client_user_id || eventData.user_id;
        triggerSlug = eventData.triggerSlug || eventData.triggerName || eventData.metadata?.trigger_slug || eventData.metadata?.trigger_name || eventData.trigger_slug;
        payload = eventData.payload || eventData.data || eventData;

        console.log(`[Composio Webhook] SUCCESS: Verified. Trigger: ${triggerSlug}, User: ${userId}`);
      } catch (verificationError) {
        console.error("[Composio Webhook] ERROR: Signature verification failed:", verificationError);
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    if (!userId || !triggerSlug) {
       console.error(`[Composio Webhook] ERROR: Missing identity data. UserID: ${userId}, Trigger: ${triggerSlug}`);
       return NextResponse.json({ error: "Missing identity data" }, { status: 400 });
    }

    const savedEvents = await saveEvent({
      userId,
      triggerSlug,
      payload,
    });
    const savedEvent = savedEvents[0];

    const { chats } = await getChatsByUserId({
      id: userId,
      limit: 1,
      startingAfter: null,
      endingBefore: null,
    });

    const activeChat = chats[0];
    if (!activeChat) {
      if (savedEvent) await updateEventStatus({ id: savedEvent.id, status: "failed" });
      return NextResponse.json({ ok: true, message: "Logged, but no active chat found" });
    }


    const chatId = activeChat.id;

    // 3. Initialize tools for proactive agent
    let composioTools: Record<string, any> = {};
    try {
      const composioSession = await composio.create(userId);
      composioTools = await composioSession.tools();
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

    // 4. Run the proactive agent
    const systemInstruction = `You are Etles, the user's proactive AI assistant. 
An external event has just occurred: "${triggerSlug}".
Payload data: ${JSON.stringify(payload)}

Your goal is to process this event immediately. 
If the event is important, notify the user in their chat. 
If you can take helpful action (e.g. "Draft a reply to this email" or "Summarize this PR"), do so using your tools.
Today's date is ${new Date().toLocaleDateString()}.
Be direct, helpful, and concise.`;

    const result = await generateText({
      model: getLanguageModel("google/gemini-2.5-flash"),
      system: systemInstruction,
      prompt: `Event triggered: ${triggerSlug}. Context: ${JSON.stringify(payload)}`,
      tools,
      stopWhen: stepCountIs(10),
    });

    // 5. Save results to chat history
    const messagesToSave: any[] = [];
    const timestamp = new Date();

    // Find trigger definition for better metadata
    const triggerDef = SUPPORTED_TRIGGERS.find((t: any) => t.slug.toLowerCase() === triggerSlug.toLowerCase());

    const eventPayload = {
      slug: triggerSlug,
      app: triggerDef?.app || "app",
      summary: triggerDef?.name || `Event: ${triggerSlug}`,
      payload: payload,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    messagesToSave.push({
      id: generateUUID(),
      chatId,
      role: "user",
      parts: [{ type: "text", text: `###EVENT_TRIGGERED###${JSON.stringify(eventPayload)}` }],
      attachments: [],
      createdAt: timestamp,
    });

    if (result.text && result.text.trim().length > 0) {
      messagesToSave.push({
        id: generateUUID(),
        chatId,
        role: "assistant",
        parts: [{ type: "text", text: result.text }],
        attachments: [],
        createdAt: new Date(timestamp.getTime() + 1000),
      });
    }

    // Save tool steps if any
    if (result.steps) {
      for (const step of result.steps) {
        if (step.toolCalls && step.toolCalls.length > 0) {
          for (const call of step.toolCalls) {
            const toolCallId = call.toolCallId;
            messagesToSave.push({
              id: generateUUID(),
              chatId,
              role: "assistant",
              parts: [{ 
                type: "tool-call", 
                toolCallId, 
                toolName: (call as any).toolName, 
                args: (call as any).args 
              }],
              attachments: [],
              createdAt: new Date(timestamp.getTime() + 2000),
            });

            const toolResult = step.toolResults?.find((r: any) => r.toolCallId === toolCallId);
            if (toolResult) {
              messagesToSave.push({
                id: generateUUID(),
                chatId,
                role: "tool",
                parts: [{ 
                  type: "tool-result", 
                  toolCallId, 
                  toolName: (call as any).toolName, 
                  result: (toolResult as any).result 
                }],
                attachments: [],
                createdAt: new Date(timestamp.getTime() + 3000),
              });
            }
          }
        }
      }
    }

    await saveMessages({ messages: messagesToSave });
    if (savedEvent) await updateEventStatus({ id: savedEvent.id, status: "processed" });

    return NextResponse.json({ ok: true, message: "Event processed" });
  } catch (error: any) {
    console.error("[Composio Webhook] Failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
