/**
 * Composio webhook AI workflow — durable via Upstash Workflow.
 *
 * Route: POST /api/composio/workflow/route.ts
 *
 * The inline webhook handler saves the event and returns 200 immediately.
 * This workflow endpoint picks up the heavy AI work asynchronously, with
 * each step running as its own HTTP invocation inside the 300 s window.
 *
 * Triggered by: app/api/composio/webhook/route.ts after saving the event.
 */

import { serve } from "@upstash/workflow/nextjs";
import { generateText, stepCountIs } from "ai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { saveMessages, updateEventStatus } from "@/lib/db/queries";
import { getLanguageModel } from "@/lib/ai/providers";
import { getWeather } from "@/lib/ai/tools/get-weather";
import {
  saveMemory,
  recallMemory,
  updateMemory,
  deleteMemory,
} from "@/lib/ai/tools/memory";
import { SUPPORTED_TRIGGERS } from "@/lib/ai/triggers";
import { generateUUID } from "@/lib/utils";
import type { ComposioWebhookWorkflowPayload } from "@/lib/workflow/client";

export const maxDuration = 300;

const composio = new Composio({ provider: new VercelProvider() });

export const { POST } = serve<ComposioWebhookWorkflowPayload>(async (context) => {
  const { userId, triggerSlug, payload, chatId, eventId } =
    context.requestPayload;

  // ── Step 1: Run proactive AI agent ───────────────────────────────────────────
  const { aiText, steps: aiSteps } = await context.run("run-agent", async () => {
    let composioTools: Record<string, any> = {};
    try {
      const session = await composio.create(userId);
      composioTools = await session.tools();
    } catch (e) {
      console.error("[ComposioWorkflow] Composio tools failed:", e);
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

    // Serialise steps for Workflow state caching
    const serialisedSteps = (result.steps ?? []).map((step) => ({
      toolCalls: step.toolCalls?.map((tc: any) => ({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args,
      })) ?? [],
      toolResults: step.toolResults?.map((tr: any) => ({
        toolCallId: tr.toolCallId,
        toolName: tr.toolName,
        result: tr.result,
      })) ?? [],
    }));

    return { aiText: result.text, steps: serialisedSteps };
  });

  // ── Step 2: Save messages to chat history ────────────────────────────────────
  await context.run("save-messages", async () => {
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

    const messagesToSave: any[] = [
      {
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
      },
    ];

    if (aiText?.trim()) {
      messagesToSave.push({
        id: generateUUID(),
        chatId,
        role: "assistant",
        parts: [{ type: "text", text: aiText }],
        attachments: [],
        createdAt: new Date(timestamp.getTime() + 1000),
      });
    }

    // Persist tool call/result pairs from AI steps
    for (const step of aiSteps) {
      for (const tc of step.toolCalls) {
        messagesToSave.push({
          id: generateUUID(),
          chatId,
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              args: tc.args,
            },
          ],
          attachments: [],
          createdAt: new Date(timestamp.getTime() + 2000),
        });

        const result = step.toolResults.find(
          (r: any) => r.toolCallId === tc.toolCallId,
        );
        if (result) {
          messagesToSave.push({
            id: generateUUID(),
            chatId,
            role: "tool",
            parts: [
              {
                type: "tool-result",
                toolCallId: result.toolCallId,
                toolName: result.toolName,
                result: result.result,
              },
            ],
            attachments: [],
            createdAt: new Date(timestamp.getTime() + 3000),
          });
        }
      }
    }

    await saveMessages({ messages: messagesToSave });
  });

  // ── Step 3: Mark event as processed ─────────────────────────────────────────
  await context.run("update-event-status", async () => {
    await updateEventStatus({ id: eventId, status: "processed" });
  });
});