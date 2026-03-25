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
import { sendLongMessage } from "@/lib/telegram/api";
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

    return id;
  });

  // ── Step 2: Load conversation history ───────────────────────────────────────
  // Returned as plain JSON so Workflow can cache and replay the step.
  const history = await context.run("load-history", async () => {
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
    // Load Composio tools scoped to this user
    let composioTools: Record<string, unknown> = {};
    try {
      const session = await composio.create(ownerUserId, {
        manageConnections: true,
      });
      composioTools = await session.tools();
    } catch (e) {
      console.error("[TelegramWorkflow] Composio tools failed:", e);
    }

    const allMessages = [
      ...history,
      { role: "user" as const, content: userText },
    ];

    const { text, toolCalls } = await generateText({
      model: getLanguageModel("google/gemini-2.5-flash"),
      system: systemPrompt({
        selectedChatModel: "google/gemini-2.5-flash",
        requestHints: {
          latitude: undefined,
          longitude: undefined,
          city: undefined,
          country: undefined,
        },
        skipArtifacts: true,
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
  });
});