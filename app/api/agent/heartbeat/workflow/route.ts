/**
 * Heartbeat Workflow — durable proactive agent.
 * Route: POST /api/agent/heartbeat/workflow/
 *
 * Triggered hourly per user by QStash cron → /api/agent/heartbeat
 * which calls triggerHeartbeatWorkflow() → this endpoint.
 *
 * Steps:
 * 1. recall-context  — pull recent memory + weekly synthesis
 * 2. check-signals   — composio tools to check calendar, email, tasks
 * 3. decide-and-act  — AI decides if proactive message is warranted
 * 4. deliver         — save to chat + push Telegram if needed
 */

import { serve } from "@upstash/workflow/nextjs";
import { generateText, stepCountIs } from "ai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import {
  getChatsByUserId,
  getBotIntegration,
  saveMessages,
  getActiveAgentTasksByChatId,
} from "@/lib/db/queries";
import { getGoogleModel, getLanguageModel } from "@/lib/ai/providers";
import { generateUUID } from "@/lib/utils";
import { sendLongMessage } from "@/lib/telegram/api";

export const maxDuration = 300;

const composio = new Composio({ provider: new VercelProvider() });

export type HeartbeatPayload = {
  userId: string;
};

export const { POST } = serve<HeartbeatPayload>(async (context) => {
  const { userId } = context.requestPayload;

  // ── Step 1: Recall context ────────────────────────────────────────────────
  const memoryContext = await context.run("recall-context", async () => {
    try {
      const index = new (await import("@upstash/vector")).Index({
        url: process.env.UPSTASH_VECTOR_REST_URL!,
        token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
      });
      const ns = index.namespace(`memory-${userId}`);

      // Recall recent priorities and weekly synthesis in parallel
      const [priorities, synthesis] = await Promise.all([
        ns.query({ data: "priorities commitments urgent tasks deadlines", topK: 8, includeMetadata: true }),
        ns.query({ data: "weekly_synthesis brief", topK: 1, includeMetadata: true }),
      ]);

      const memoryLines = priorities
        .map((r) => (r.metadata as any)?.content)
        .filter(Boolean)
        .join("\n");
      const weeklyBrief = (synthesis[0]?.metadata as any)?.content ?? "";

      return { memoryLines, weeklyBrief };
    } catch {
      return { memoryLines: "", weeklyBrief: "" };
    }
  });

  // ── Step 2: Get active chat + open tasks ──────────────────────────────────
  const contextData = await context.run("load-tasks-and-chat", async () => {
    const { chats } = await getChatsByUserId({
      id: userId,
      limit: 1,
      startingAfter: null,
      endingBefore: null,
    });
    const activeChat = chats[0];
    if (!activeChat) return { chatId: null, openTasks: [] };

    const tasks = await getActiveAgentTasksByChatId(activeChat.id, userId);
    const openTasks = tasks.map((t) => `[${t.agentType}] ${t.task}`);
    return { chatId: activeChat.id, openTasks };
  });

  if (!contextData.chatId) return; // no active chat, nothing to do

  // ── Step 3: Load Composio signals (calendar, email) ───────────────────────
  const signals = await context.run("check-signals", async () => {
    let composioTools: Record<string, unknown> = {};
    try {
      const session = await composio.create(userId);
      composioTools = await session.tools();
    } catch { /* Composio optional */ }

    const result = await generateText({
      model: getGoogleModel("google/gemini-2.5-flash"),
      system: `You are Etles's background intelligence scanner. Your ONLY job is to check the user's calendar, email, and tasks for anything urgent or time-sensitive in the next 24 hours.

Return a JSON object with this exact shape:
{
  "hasUrgentItems": boolean,
  "urgentSummary": "1-3 sentence plain text summary if urgent, empty string if not",
  "items": ["item1", "item2"]
}

Check: upcoming calendar events (next 4 hours), unread high-priority emails, overdue tasks.
Be selective — only flag genuinely urgent items. If nothing urgent, set hasUrgentItems: false.
Return ONLY the JSON object, no other text.`,
      prompt: `User context:\n${memoryContext.memoryLines}\n\nOpen tasks:\n${contextData.openTasks.join("\n") || "None"}\n\nCheck for urgent items now.`,
      tools: composioTools as any,
      stopWhen: stepCountIs(5),
    });

    try {
      const clean = result.text.replace(/```json|```/g, "").trim();
      return JSON.parse(clean) as {
        hasUrgentItems: boolean;
        urgentSummary: string;
        items: string[];
      };
    } catch {
      return { hasUrgentItems: false, urgentSummary: "", items: [] };
    }
  });

  // No urgent items — stop here, don't bother the user
  if (!signals.hasUrgentItems) return;

  // ── Step 4: Generate proactive message ────────────────────────────────────
  const proactiveMessage = await context.run("generate-message", async () => {
    const { text } = await generateText({
      model: getGoogleModel("google/gemini-2.5-flash"),
      system: `You are Etles, the user's proactive AI chief of staff. You're reaching out because something important needs their attention.

Write a SHORT, direct Telegram message (max 4 sentences). No fluff. No "I noticed". Just the facts and what they should do.
Use Telegram HTML formatting only: <b>bold</b>, <i>italic</i>.`,
      prompt: `Urgent items detected:\n${signals.urgentSummary}\n\nDetails:\n${signals.items.join("\n")}\n\nWeekly context:\n${memoryContext.weeklyBrief}`,
    });
    return text.trim();
  });

  // ── Step 5: Save to chat + push Telegram ─────────────────────────────────
  await context.run("deliver", async () => {
    // Save to chat
    await saveMessages({
      messages: [{
        id: generateUUID(),
        chatId: contextData.chatId!,
        role: "assistant",
        parts: [{ type: "text", text: proactiveMessage }],
        attachments: [],
        createdAt: new Date(),
      }] as any,
    });

    // Push via Telegram if connected
    const integration = await getBotIntegration({ userId, platform: "telegram" });
    if (!integration) return;

    // Get the user's Telegram chat ID from Redis
    const redis =
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? new (await import("@upstash/redis")).Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
          })
        : null;
    if (!redis) return;

    // Scan for tg:chat:{userId}:* keys to find active Telegram chats
    const keys = await redis.keys(`tg:chat:${userId}:*`);
    for (const key of keys) {
      const telegramChatId = Number(key.split(":").at(-1));
      if (!isNaN(telegramChatId)) {
        await sendLongMessage(integration.botToken, telegramChatId, proactiveMessage);
      }
    }
  });
});
