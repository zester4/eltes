/**
 * app/api/agent/morning/workflow/route.ts
 *
 * Morning Briefing Workflow — fires at the user's configured morning hour.
 * This is intentionally FASTER and more FOCUSED than the hourly heartbeat:
 *
 *   Heartbeat: hourly scan for URGENT items, interjects only when needed
 *   Morning Briefing: daily guaranteed delivery — always sends regardless
 *
 * Steps:
 *   1. recall-priorities   — top memories + goals + weekly synthesis brief
 *   2. load-calendar       — today's events via Composio Calendar
 *   3. scan-inbox          — overnight emails classified by priority
 *   4. generate-brief      — LLM synthesizes everything into an actionable brief
 *   5. deliver             — saves to chat + pushes via Telegram
 *
 * Route: POST /api/agent/morning/workflow
 * Triggered by: per-user QStash cron (created via /api/agent/heartbeat/activate)
 */

import { serve } from "@upstash/workflow/nextjs";
import { generateText, stepCountIs } from "ai";
import { Index } from "@upstash/vector";
import { Redis } from "@upstash/redis";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { getGoogleModel } from "@/lib/ai/providers";
import {
  getChatsByUserId,
  getBotIntegration,
  saveMessages,
} from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";
import { sendLongMessage } from "@/lib/telegram/api";

export const maxDuration = 300;

const composio = new Composio({ provider: new VercelProvider() });

type MorningPayload = {
  userId: string;
};

export const { POST } = serve<MorningPayload>(async (context) => {
  const { userId } = context.requestPayload;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  console.log(`[Morning Briefing] Starting for user: ${userId} on ${today}`);

  // ── Step 1: Recall priorities and weekly synthesis ────────────────────────
  const memoryContext = await context.run("recall-priorities", async () => {
    try {
      const index = new Index({
        url: process.env.UPSTASH_VECTOR_REST_URL!,
        token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
      });
      const ns = index.namespace(`memory-${userId}`);

      const [priorities, synthesis, goals] = await Promise.all([
        ns.query({
          data: "priorities commitments work projects deadlines",
          topK: 10,
          includeMetadata: true,
        }),
        ns.query({ data: "weekly synthesis brief", topK: 1, includeMetadata: true }),
        ns.query({ data: "goals objectives targets", topK: 5, includeMetadata: true }),
      ]);

      const memLines = priorities
        .map((r) => (r.metadata as any)?.content)
        .filter(Boolean)
        .join("\n");
      const weeklyBrief = (synthesis[0]?.metadata as any)?.content ?? "";
      const goalLines = goals
        .map((r) => (r.metadata as any)?.content)
        .filter(Boolean)
        .join("\n");

      return { memLines, weeklyBrief, goalLines };
    } catch {
      return { memLines: "", weeklyBrief: "", goalLines: "" };
    }
  });

  // ── Step 2: Load today's calendar + overnight email summary ──────────────
  const externalSignals = await context.run("check-calendar-inbox", async () => {
    let composioTools: Record<string, unknown> = {};
    try {
      const session = await composio.create(userId);
      composioTools = await session.tools();
    } catch {
      return { calendarSummary: "", emailSummary: "" };
    }

    const calendarPrompt = "List all of today's calendar events. Include time, title, and attendees.";
    const emailPrompt = "List the 5 most important unread emails received in the last 12 hours. Include sender, subject, and a 1-sentence summary of each.";

    const [calResult, emailResult] = await Promise.allSettled([
      generateText({
        model: getGoogleModel("gemini-2.5-flash"),
        system: "You are a calendar assistant. Return only the list of events, no other commentary.",
        prompt: calendarPrompt,
        tools: composioTools as any,
        stopWhen: stepCountIs(3),
      }),
      generateText({
        model: getGoogleModel("gemini-2.5-flash"),
        system: "You are an email assistant. Return only the list of important emails, no other commentary.",
        prompt: emailPrompt,
        tools: composioTools as any,
        stopWhen: stepCountIs(3),
      }),
    ]);

    return {
      calendarSummary:
        calResult.status === "fulfilled" ? calResult.value.text : "",
      emailSummary:
        emailResult.status === "fulfilled" ? emailResult.value.text : "",
    };
  });

  // ── Step 3: Generate the morning brief ───────────────────────────────────
  const morningBrief = await context.run("generate-brief", async () => {
    const hasExternalData =
      externalSignals.calendarSummary || externalSignals.emailSummary;

    const { text } = await generateText({
      model: getGoogleModel("gemini-2.5-flash"),
      system: `You are Etles, the user's proactive AI chief of staff. 
You prepare a sharp morning briefing every day delivered to the user as their day starts.

Hard rules:
- Lead with the most time-sensitive item first
- Use Telegram HTML: <b>bold</b>, <i>italic</i>
- Max 280 words total
- Every section must have at least one actionable item
- If calendar or email data is missing, be transparent about it
- Close with exactly 3 prioritized actions for the first 90 minutes

Format:
🌅 <b>Good morning — ${today}</b>

<b>Today's Focus</b>
[Most important goal or commitment for today]

<b>Your Day</b>
[Calendar highlights — or note if no calendar connected]

<b>Inbox</b>
[Key emails requiring attention — or note if none/not connected]

<b>From Your Weekly Brief</b>
[1-2 sentences from the weekly synthesis most relevant today]

<b>First 90 Minutes</b>
1. [Action — verb-first, specific]
2. [Action]
3. [Action]`,
      prompt: `Today: ${today}

User's priorities from memory:
${memoryContext.memLines || "(no priority memories found)"}

User's active goals:
${memoryContext.goalLines || "(no goal memories found)"}

Weekly operating brief:
${memoryContext.weeklyBrief || "(no weekly synthesis yet)"}

Today's calendar events:
${externalSignals.calendarSummary || "(calendar not connected or empty)"}

Overnight important emails:
${externalSignals.emailSummary || "(inbox not connected or empty)"}`,
    });

    return text.trim();
  });

  // ── Step 4: Deliver to chat + Telegram ───────────────────────────────────
  await context.run("deliver-brief", async () => {
    const { chats } = await getChatsByUserId({
      id: userId,
      limit: 1,
      startingAfter: null,
      endingBefore: null,
    });
    const activeChat = chats[0];

    if (activeChat) {
      await saveMessages({
        messages: [
          {
            id: generateUUID(),
            chatId: activeChat.id,
            role: "assistant",
            parts: [{ type: "text", text: morningBrief }],
            attachments: [],
            createdAt: new Date(),
          },
        ] as any,
      });
    }

    // Push to Telegram
    const integration = await getBotIntegration({
      userId,
      platform: "telegram",
    });
    if (!integration) return;

    const redis =
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
          })
        : null;
    if (!redis) return;

    const keys = await redis.keys(`tg:chat:${userId}:*`);
    for (const key of keys) {
      const telegramChatId = Number(key.split(":").at(-1));
      if (!isNaN(telegramChatId)) {
        await sendLongMessage(integration.botToken, telegramChatId, morningBrief);
      }
    }

    console.log(`[Morning Briefing] Delivered to user: ${userId}`);
  });

  // ── Step 5: Update status ─────────────────────────────────────────────────
  await context.run("update-status", async () => {
    const redis =
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
          })
        : null;
    if (!redis) return;

    await redis.set(
      `agent:status:${userId}:morning`,
      JSON.stringify({
        lastRun: new Date().toISOString(),
        status: "success",
      }),
      { ex: 86400 * 2 },
    );
  });
});