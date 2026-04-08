/**
 * Telegram webhook handler.
 *
 * Route: POST /api/telegram/[userId]
 *
 * Returns 200 immediately. All work happens in after():
 * - Slash commands (/start, /status, /help) are handled inline — fast, no AI.
 * - Regular messages trigger an Upstash Workflow run so AI execution is
 *   durable and survives any Vercel serverless timeout limit.
 *   Falls back to the original inline routeMessage() if Workflow is not
 *   configured (QSTASH_TOKEN missing).
 */

import { after } from "next/server";
import { generateText, stepCountIs } from "ai";
import { Redis } from "@upstash/redis";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import {
  getBotIntegration,
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
import { generateUUID } from "@/lib/utils";
import { sendLongMessage, sendTypingAction } from "@/lib/telegram/api";
import {
  isWorkflowEnabled,
  triggerTelegramWorkflow,
} from "@/lib/workflow/client";
import type { DBMessage } from "@/lib/db/schema";

const composio = new Composio({ provider: new VercelProvider() });

export const maxDuration = 60;

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// ── Types ─────────────────────────────────────────────────────────────────────

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string };
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId: ownerUserId } = await params;

  // Verify Telegram secret token
  const secretToken = request.headers.get("x-telegram-bot-api-secret-token");
  if (
    process.env.TELEGRAM_SECRET_TOKEN &&
    secretToken !== process.env.TELEGRAM_SECRET_TOKEN
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const msg = update.message;
  const cq = (update as any).callback_query;

  // If it's a callback query, forward to the callback handler
  if (cq) {
    const callbackUrl = `${process.env.BASE_URL || new URL(request.url).origin}/api/telegram/callback/${ownerUserId}`;
    after(async () => {
      await fetch(callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-bot-api-secret-token": request.headers.get("x-telegram-bot-api-secret-token") || "",
        },
        body: JSON.stringify(update),
      });
    });
    return new Response("OK", { status: 200 });
  }

  if (!msg?.text) return new Response("OK", { status: 200 });

  const telegramChatId = msg.chat.id;
  const senderName =
    [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") ||
    msg.from?.username ||
    "Telegram user";
  const userText = msg.text.trim();

  const integration = await getBotIntegration({
    userId: ownerUserId,
    platform: "telegram",
  });
  if (!integration) {
    console.error(
      `[Telegram] No integration for owner ${ownerUserId}`,
    );
    return new Response("OK", { status: 200 });
  }

  const botToken = integration.botToken;
  const baseUrl = process.env.BASE_URL || new URL(request.url).origin;

  // Return 200 immediately — all work happens in after()
  after(async () => {
    try {
      // ── Slash commands: fast, handled inline, no AI needed ──────────────────
      if (userText === "/start") {
        if (redis) {
          const key = `tg:chat:${ownerUserId}:${telegramChatId}`;
          await redis.del(key);
        }
        await sendLongMessage(
          botToken,
          telegramChatId,
          "👋 Hi! I'm your AI assistant. Send me any message or task — I can handle both quick questions and long-running research.",
        );
        return;
      }

      if (userText === "/status") {
        await sendLongMessage(
          botToken,
          telegramChatId,
          "✅ **Integration status**\n\nBot is connected and responding. Your keys are stored correctly.\n\nIf you're not getting AI responses, check:\n• BASE_URL must be a public URL (not localhost)\n• Use ngrok for local development",
        );
        return;
      }

      if (userText === "/help") {
        await sendLongMessage(
          botToken,
          telegramChatId,
          "🤖 <b>What I can do:</b>\n\n" +
          "• Answer questions instantly\n" +
          "• Remember things for you\n" +
          "• Set reminders and recurring tasks\n" +
          "• Research topics in depth\n" +
          "• Perform multi-step tasks (even hours-long ones)\n" +
          "• Ask for your approval before irreversible actions\n\n" +
          "<b>Commands:</b>\n/start — Reset conversation\n/help — Show this message\n/status — Verify integration is working",
        );
        return;
      }

      // ── Regular messages: offload to Workflow if available ──────────────────
      if (isWorkflowEnabled()) {
        try {
          const triggered = await triggerTelegramWorkflow({
            ownerUserId,
            botToken,
            telegramChatId,
            senderName,
            userText,
            baseUrl,
          });
          if (triggered) return; // Workflow will handle the rest
        } catch (e) {
          console.error("[Telegram] Failed to trigger workflow, falling back:", e);
        }
      }

      // ── Fallback: run inline (original behaviour, no Workflow configured) ───
      await routeMessage({
        ownerUserId,
        botToken,
        telegramChatId,
        senderName,
        userText,
        baseUrl,
      });
    } catch (error) {
      console.error("[Telegram] Top-level error:", error);
      try {
        await sendLongMessage(
          botToken,
          telegramChatId,
          "Sorry, something went wrong. Please try again.",
        );
      } catch { /* ignore */ }
    }
  });

  return new Response("OK", { status: 200 });
}

// ── Inline fallback (used when Workflow is not configured) ────────────────────

async function routeMessage({
  ownerUserId,
  botToken,
  telegramChatId,
  senderName,
  userText,
  baseUrl,
}: {
  ownerUserId: string;
  botToken: string;
  telegramChatId: number;
  senderName: string;
  userText: string;
  baseUrl: string;
}) {
  const chatId = await getOrCreateChat(ownerUserId, telegramChatId, senderName);

  await saveMessages({
    messages: [
      {
        id: generateUUID(),
        chatId,
        role: "user",
        parts: [{ type: "text" as const, text: userText }],
        attachments: [],
        createdAt: new Date(),
      },
    ] as any,
  });

  await touchUserActivity(ownerUserId);

  await sendTypingAction(botToken, telegramChatId);

  const dbMessages: DBMessage[] = await getMessagesByChatId({ id: chatId });
  const history = dbMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const textPart = (m.parts as any[]).find((p: any) => p.type === "text");
      return { role: m.role as "user" | "assistant", content: textPart?.text ?? "" };
    })
    .filter((m) => m.content.length > 0);

  const allMessages = [...history, { role: "user" as const, content: userText }];

  let composioTools: Record<string, unknown> = {};
  try {
    const session = await composio.create(ownerUserId, { manageConnections: true });
    composioTools = await session.tools();
  } catch (e) {
    console.error("[Telegram] Failed to load Composio tools:", e);
  }

  const sessionTail = await getSessionTail(ownerUserId);
  const tools = buildEtlesTelegramTools({
    userId: ownerUserId,
    chatId,
    baseUrl,
    composioTools,
  });

  const { text: aiText, toolCalls } = await generateText({
    model: getGoogleModel("gemini-2.5-flash"),
    system: systemPrompt({
      selectedChatModel: "google/gemini-2.5-flash",
      requestHints: {
        latitude: undefined,
        longitude: undefined,
        city: undefined,
        country: undefined,
      },
      sessionTail,
      skipArtifacts: true,
    }),
    messages: allMessages,
    stopWhen: stepCountIs(25),
    tools,
  });

  await saveMessages({
    messages: [
      {
        id: generateUUID(),
        chatId,
        role: "assistant",
        parts: [
          { type: "text" as const, text: aiText },
          ...(toolCalls?.map((tc) => ({
            type: "tool-call" as const,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            args: (tc as any).args,
          })) ?? []),
        ],
        attachments: [],
        createdAt: new Date(),
      },
    ] as any,
  });

  if (aiText.trim()) {
    await sendLongMessage(botToken, telegramChatId, aiText);
  }

  const tail = (await getMessagesByChatId({ id: chatId }))
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
}

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