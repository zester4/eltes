/**
 * Weekly Synthesis Workflow.
 * Route: POST /api/agent/heartbeat/synthesis
 *
 * Runs every Monday at 8am UTC via QStash cron.
 * Uses the chief_of_staff sub-agent to review the last 7 days of memory
 * and produce a forward-looking brief saved to memory key "weekly_synthesis".
 */

import { serve } from "@upstash/workflow/nextjs";
import { generateText } from "ai";
import { Redis } from "@upstash/redis";
import { Index } from "@upstash/vector";
import { getGoogleModel } from "@/lib/ai/providers";
import {
  getChatsByUserId,
  getBotIntegration,
  saveMessages,
} from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";
import { sendLongMessage } from "@/lib/telegram/api";

export const maxDuration = 300;

export type SynthesisPayload = {
  userId: string;
};

export const { POST } = serve<SynthesisPayload>(async (context) => {
  const { userId } = context.requestPayload;
  console.log(`[Synthesis] Starting weekly synthesis for user: ${userId}`);

  // ── Step 1: Pull last 7 days of memory ───────────────────────────────────
  const allMemories = await context.run("recall-all-memory", async () => {
    try {
      const index = new Index({
        url: process.env.UPSTASH_VECTOR_REST_URL!,
        token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
      });
      const ns = index.namespace(`memory-${userId}`);

      const results = await ns.query({
        data: "work commitments goals projects tasks people meetings",
        topK: 30,
        includeMetadata: true,
      });

      return results
        .map((r) => {
          const m = r.metadata as any;
          return m?.content ? `[${m.key ?? "memory"}] ${m.content}` : null;
        })
        .filter(Boolean)
        .join("\n");
    } catch {
      return "";
    }
  });

  const persistSynthesisStatus = async (status: string) => {
    if (
      !process.env.UPSTASH_REDIS_REST_URL ||
      !process.env.UPSTASH_REDIS_REST_TOKEN
    ) {
      return;
    }
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    await redis.set(
      `agent:status:${userId}:synthesis`,
      JSON.stringify({
        lastRun: new Date().toISOString(),
        status,
      }),
      { ex: 86400 * 14 },
    );
  };

  if (!allMemories) {
    await context.run("update-status-skipped", async () => {
      await persistSynthesisStatus("skipped_no_memory");
    });
    return;
  }

  // ── Step 2: Generate weekly brief ────────────────────────────────────────
  const weeklyBrief = await context.run("generate-brief", async () => {
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const { text } = await generateText({
      model: getGoogleModel("gemini-2.5-flash"),
      system: `You are Etles, the user's chief of staff. Review their memory and produce a concise weekly brief.

Structure your brief as:
1. **What's at risk** — commitments or deadlines that may slip
2. **What needs follow-up** — threads that have gone quiet
3. **Patterns I see** — recurring themes that suggest action
4. **Top 3 focus areas this week** — specific and actionable

Be direct. Max 300 words. No generic advice. Only reference things the user has actually told you about.
Write in first person as Etles addressing the user.`,
      prompt: `Today is ${today}.\n\nUser's memory:\n${allMemories}`,
    });

    return text.trim();
  });

  // ── Step 3: Save to memory (overwrites previous week's brief) ────────────
  await context.run("save-to-memory", async () => {
    const index = new Index({
      url: process.env.UPSTASH_VECTOR_REST_URL!,
      token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
    });
    const ns = index.namespace(`memory-${userId}`);

    await ns.upsert({
      id: "weekly_synthesis",
      data: weeklyBrief,
      metadata: {
        key: "weekly_synthesis",
        content: weeklyBrief,
        tags: ["weekly", "synthesis", "brief"],
        savedAt: new Date().toISOString(),
      },
    });
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
    if (!activeChat) return;

    const message = `📋 <b>Your Weekly Brief</b>\n\n${weeklyBrief}`;

    await saveMessages({
      messages: [{
        id: generateUUID(),
        chatId: activeChat.id,
        role: "assistant",
        parts: [{ type: "text", text: message }],
        attachments: [],
        createdAt: new Date(),
      }] as any,
    });

    // Push to Telegram
    const integration = await getBotIntegration({ userId, platform: "telegram" });
    if (!integration) return;

    const redis =
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? new (await import("@upstash/redis")).Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
          })
        : null;
    if (!redis) return;

    const keys = await redis.keys(`tg:chat:${userId}:*`);
    for (const key of keys) {
      const telegramChatId = Number(key.split(":").at(-1));
      if (!isNaN(telegramChatId)) {
        await sendLongMessage(integration.botToken, telegramChatId, message);
      }
    }
  });

  // ── Step 5: Update Synthesis Status ───────────────────────────────────────
  await context.run("update-status", async () => {
    await persistSynthesisStatus("success");
  });
});
