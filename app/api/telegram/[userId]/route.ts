/**
 * Telegram webhook handler — inline generateText for all messages.
 *
 * Route: POST /api/telegram/[userId]
 *
 * Setup: Set BASE_URL to your public URL (e.g. ngrok in dev). If TELEGRAM_SECRET_TOKEN
 * is set, it must match what Telegram sends in x-telegram-bot-api-secret-token.
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
import { getLanguageModel } from "@/lib/ai/providers";
import { systemPrompt } from "@/lib/ai/prompts";
import { getWeather } from "@/lib/ai/tools/get-weather";
import {
  saveMemory,
  recallMemory,
  updateMemory,
  deleteMemory,
} from "@/lib/ai/tools/memory";
import {
  setReminder,
  setCronJob,
  listSchedules,
  deleteSchedule,
} from "@/lib/ai/tools/schedule";
import {
  setupTrigger,
  listActiveTriggers,
  removeTrigger,
} from "@/lib/ai/tools/triggers";
import {
  delegateToSubAgent,
  getSubAgentResult,
  listSubAgents,
} from "@/lib/ai/tools/subagents";
import { generateUUID } from "@/lib/utils";
import { sendLongMessage, sendTypingAction } from "@/lib/telegram/api";
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
      `[Telegram] No integration for owner ${ownerUserId} — ensure you saved the bot token in Settings > Connections`,
    );
    return new Response("OK", { status: 200 });
  }
  const botToken = integration.botToken;
  const baseUrl = process.env.BASE_URL || new URL(request.url).origin;

  // Return 200 immediately — all work happens in after()
  after(async () => {
    try {
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

// ── Core router ───────────────────────────────────────────────────────────────

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
  // Handle /start — reset conversation (clear Redis cache if available)
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

  // Handle /status — verify integration is working (no token exposed)
  if (userText === "/status") {
    await sendLongMessage(
      botToken,
      telegramChatId,
      "✅ **Integration status**\n\nBot is connected and responding. Your keys are stored correctly.\n\nIf you're not getting AI responses, check:\n• BASE_URL must be a public URL (not localhost)\n• Use ngrok for local development",
    );
    return;
  }

  // Handle /help
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

  // Get or create DB chat
  const chatId = await getOrCreateChat(ownerUserId, telegramChatId, senderName);

  // Save user message to DB
  await saveMessages({
    messages: [
      {
        id: generateUUID(),
        chatId,
        role: "user",
        parts: [{ type: "text", text: userText }],
        attachments: [],
        createdAt: new Date(),
      },
    ] as any,
  });

  // Inline conversational response
  await sendTypingAction(botToken, telegramChatId);

  // Load history
  const dbMessages: DBMessage[] = await getMessagesByChatId({ id: chatId });
  const history = dbMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const textPart = (m.parts as any[]).find((p: any) => p.type === "text");
      return { role: m.role as "user" | "assistant", content: textPart?.text ?? "" };
    })
    .filter((m) => m.content.length > 0);

  const allMessages = [...history, { role: "user" as const, content: userText }];

  // Load Composio tools (Gmail, etc.) — same as chat route
  let composioTools: Record<string, unknown> = {};
  try {
    const composioSession = await composio.create(ownerUserId, {
      manageConnections: true,
    });
    composioTools = await composioSession.tools();
  } catch (e) {
    console.error("[Telegram] Failed to load Composio tools:", e);
  }

  const { text: aiText, toolCalls } = await generateText({
    model: getLanguageModel("google/gemini-2.5-flash"),
    system: systemPrompt({
      selectedChatModel: "google/gemini-2.5-flash",
      requestHints: {
        latitude: undefined,
        longitude: undefined,
        city: undefined,
        country: undefined,
      },
      skipArtifacts: true, // Telegram has no artifact UI
    }),
    messages: allMessages,
    stopWhen: stepCountIs(15),
    tools: {
      ...composioTools,
      getWeather,
      saveMemory: saveMemory({ userId: ownerUserId }),
      recallMemory: recallMemory({ userId: ownerUserId }),
      updateMemory: updateMemory({ userId: ownerUserId }),
      deleteMemory: deleteMemory({ userId: ownerUserId }),
      setReminder: setReminder({ userId: ownerUserId, baseUrl }),
      setCronJob: setCronJob({ userId: ownerUserId, baseUrl }),
      listSchedules: listSchedules({ userId: ownerUserId }),
      deleteSchedule: deleteSchedule(),
      setupTrigger: setupTrigger({ userId: ownerUserId }),
      listActiveTriggers: listActiveTriggers({ userId: ownerUserId }),
      removeTrigger: removeTrigger(),
      delegateToSubAgent: delegateToSubAgent({
        userId: ownerUserId,
        chatId,
        baseUrl,
      }),
      getSubAgentResult: getSubAgentResult({ userId: ownerUserId }),
      listSubAgents: listSubAgents(),
    },
  });

  // Save assistant message
  await saveMessages({
    messages: [
      {
        id: generateUUID(),
        chatId,
        role: "assistant",
        parts: [
          { type: "text", text: aiText },
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