/**
 * Telegram AI workflow — durable via Upstash Workflow.
 *
 * Route: POST /api/telegram/workflow
 *
 * Each step runs as its own HTTP invocation so the 60 s / 300 s Vercel
 * serverless limit never applies to the full AI execution. The endpoint's
 * own maxDuration (300 s) governs each individual step.
 *
 * Triggered by: app/api/telegram/[userId]/route.ts → after() block
 */

import { serve } from "@upstash/workflow/nextjs";
import { generateText, stepCountIs } from "ai";
import { Redis } from "@upstash/redis";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import {
  getChatById,
  getMessagesByChatId,
  saveChat,
  saveMessages,
} from "@/lib/db/queries";
import { getGoogleModel } from "@/lib/ai/providers";
import { systemPrompt } from "@/lib/ai/prompts";
import { buildEtlesTelegramTools } from "@/lib/ai/build-etles-telegram-tools";
import { getSessionTail, saveSessionTail } from "@/lib/session-tail";
import { touchUserActivity } from "@/lib/user-activity";
import { getCachedSystemPrompt, setCachedSystemPrompt } from "@/lib/prompt-cache";
import { generateUUID } from "@/lib/utils";
import {
  sendLongMessage,
  sendStatusMessage,
  editMessageText,
  deleteMessage,
  startTypingHeartbeat,
} from "@/lib/telegram/api";
import type { TelegramWorkflowPayload } from "@/lib/workflow/client";

export const maxDuration = 300;

// ── Singletons (reused across warm invocations) ───────────────────────────────

const composio = new Composio({ provider: new VercelProvider() });

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function redisChatKey(ownerUserId: string, telegramChatId: number): string {
  return `tg:chat:${ownerUserId}:${telegramChatId}`;
}

async function getOrCreateChat(
  ownerUserId: string,
  telegramChatId: number,
  senderName: string,
): Promise<string> {
  if (redis) {
    const key = redisChatKey(ownerUserId, telegramChatId);
    const cached = await redis.get<string>(key);
    if (cached) {
      const chat = await getChatById({ id: cached });
      if (chat) return cached;
    }
  }

  const chatId = generateUUID();
  await saveChat({
    id: chatId,
    userId: ownerUserId,
    title: `Telegram: ${senderName}`,
    visibility: "private",
    platformThreadId: `telegram:${ownerUserId}:${telegramChatId}`,
  });

  if (redis) {
    const key = redisChatKey(ownerUserId, telegramChatId);
    await redis.set(key, chatId, { ex: 60 * 60 * 24 * 90 });
  }

  return chatId;
}

// ── Workflow ──────────────────────────────────────────────────────────────────

export const { POST } = serve<TelegramWorkflowPayload>(async (context) => {
  const { ownerUserId, botToken, telegramChatId, senderName, userText, baseUrl } =
    context.requestPayload;
  const statusMessageId = await context.run("status-start", async () => {
    return sendStatusMessage(
      botToken,
      telegramChatId,
      "🤖 <b>Etles is on it</b>\n\nAnalyzing your request...",
    );
  });

  // ── Step 1: Get / create DB chat, persist user message ──────────────────────
  const chatId = await context.run("setup-chat", async () => {
    const id = await getOrCreateChat(ownerUserId, telegramChatId, senderName);

    await saveMessages({
      messages: [
        {
          id: generateUUID(),
          chatId: id,
          role: "user",
          parts: [{ type: "text" as const, text: userText }],
          attachments: [],
          createdAt: new Date(),
        },
      ] as any,
    });

    await touchUserActivity(ownerUserId);

    return id;
  });

  // ── Step 2: Load conversation history ───────────────────────────────────────
  // Returned as plain JSON so Workflow can cache and replay the step.
  const history = await context.run("load-history", async () => {
    if (statusMessageId) {
      await editMessageText(
        botToken,
        telegramChatId,
        statusMessageId,
        "🧠 <b>Etles is thinking</b>\n\nGathering conversation context...",
      );
    }
    const dbMessages = await getMessagesByChatId({ id: chatId });
    return dbMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        const textPart = (m.parts as any[]).find((p: any) => p.type === "text");
        return {
          role: m.role as "user" | "assistant",
          content: textPart?.text ?? "",
        };
      })
      .filter((m) => m.content.length > 0);
  });

  // ── Step 3: Run AI (the expensive step — gets its own 300 s window) ──────────
  const { aiText, toolCallParts } = await context.run("run-ai", async () => {
    if (statusMessageId) {
      await editMessageText(
        botToken,
        telegramChatId,
        statusMessageId,
        "🛠 <b>Working with tools</b>\n\nCalling apps and planning the best answer...",
      );
    }
    const stopTyping = startTypingHeartbeat(botToken, telegramChatId);
    let composioTools: Record<string, unknown> = {};
    try {
      const session = await composio.create(ownerUserId, {
        manageConnections: true,
      });
      composioTools = await session.tools();
    } catch (e) {
      console.error("[TelegramWorkflow] Composio tools failed:", e);
    }

    const sessionTail = await getSessionTail(ownerUserId);
    const promptSignature = JSON.stringify({
      selectedChatModel: "google/gemini-2.5-flash",
      requestHints: {
        latitude: undefined,
        longitude: undefined,
        city: undefined,
        country: undefined,
      },
      sessionTail,
      skipArtifacts: true,
      surface: "telegram-workflow",
    });
    let cachedPrompt = await getCachedSystemPrompt({
      userId: ownerUserId,
      scope: "telegram",
      signature: promptSignature,
    });
    if (!cachedPrompt) {
      cachedPrompt = systemPrompt({
        selectedChatModel: "google/gemini-2.5-flash",
        requestHints: {
          latitude: undefined,
          longitude: undefined,
          city: undefined,
          country: undefined,
        },
        sessionTail,
        skipArtifacts: true,
      });
      await setCachedSystemPrompt({
        userId: ownerUserId,
        scope: "telegram",
        signature: promptSignature,
        prompt: cachedPrompt,
      });
    }

    const allMessages = [
      ...history,
      { role: "user" as const, content: userText },
    ];

    const tools = buildEtlesTelegramTools({
      userId: ownerUserId,
      chatId,
      baseUrl,
      composioTools,
    });

    const { text, toolCalls } = await generateText({
      model: getGoogleModel("gemini-2.5-flash"),
      system: cachedPrompt,
      messages: allMessages,
      stopWhen: stepCountIs(25),
      tools,
    }).finally(() => {
      stopTyping();
    });

    // Serialise tool calls for Workflow state caching
    const serialisedToolCalls =
      toolCalls?.map((tc) => ({
        type: "tool-call" as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: (tc as any).args,
      })) ?? [];

    return { aiText: text, toolCallParts: serialisedToolCalls };
  });

  // ── Step 4: Persist assistant message + deliver to Telegram ─────────────────
  await context.run("save-and-send", async () => {
    if (statusMessageId) {
      await editMessageText(
        botToken,
        telegramChatId,
        statusMessageId,
        "✅ <b>Done</b>\n\nSending your response...",
      );
    }
    await saveMessages({
      messages: [
        {
          id: generateUUID(),
          chatId,
          role: "assistant",
          parts: [
            { type: "text" as const, text: aiText },
            ...toolCallParts,
          ],
          attachments: [],
          createdAt: new Date(),
        },
      ] as any,
    });

    if (aiText.trim()) {
      await sendLongMessage(botToken, telegramChatId, aiText);
    }

    const recent = await getMessagesByChatId({ id: chatId });
    const tail = recent
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-5)
      .map((m) => {
        const textPart = (m.parts as { type: string; text?: string }[]).find(
          (p) => p.type === "text",
        );
        return {
          role: m.role as "user" | "assistant",
          text: textPart?.text ?? "",
        };
      })
      .filter((m) => m.text.length > 0);
    await saveSessionTail(ownerUserId, tail);
    if (statusMessageId) {
      await deleteMessage(botToken, telegramChatId, statusMessageId);
    }
  });
});