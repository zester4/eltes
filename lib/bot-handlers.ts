import { Chat, toAiMessages } from "chat";
import type { SlackAdapter } from "@chat-adapter/slack";
import { streamText } from "ai";
import { getLanguageModel } from "@/lib/ai/providers";
import { createGuestUser, saveChat, saveMessages } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";
import { getWeather } from "@/lib/ai/tools/get-weather";

// Platforms where thread.post(stream) is unsupported — must await text and post markdown.
// Source: Chat SDK feature matrix — GitHub ❌, Linear ❌, WhatsApp ❌, Resend (email) ❌
const NON_STREAMING_PLATFORMS = new Set(["github", "linear", "whatsapp", "resend"]);

async function postAIResponse(
  thread: any,
  fullStream: AsyncIterable<any>,
  textPromise: PromiseLike<string>,
  platform: string,
) {
  if (NON_STREAMING_PLATFORMS.has(platform)) {
    const text = await textPromise;
    await thread.post({ markdown: text });
  } else {
    await thread.post(fullStream);
  }
}

/**
 * Core AI response logic — shared by onNewMention and onNewMessage.
 * Subscribes the thread, creates a DB chat record, runs streamText,
 * saves messages, and posts the response.
 */
async function handleFirstMessage(
  thread: any,
  message: any,
  platform: string,
  ownerUserId: string,
) {
  try {
    await thread.startTyping("Thinking...");
  } catch { /* best-effort — no-op on unsupported platforms */ }

  await thread.subscribe();

  const [guestUser] = await createGuestUser();
  const chatId = generateUUID();

  await thread.setState({ chatId });

  await saveChat({
    id: chatId,
    userId: ownerUserId,
    title: `Chat from ${message?.author?.fullName || "External Platform"}`,
    visibility: "private",
    platformThreadId: thread.id,
  });

  const response = await streamText({
    model: getLanguageModel("google/gemini-2.5-flash"),
    prompt: message?.text || "",
    tools: { getWeather },
    onFinish: async ({ text, toolCalls }) => {
      const timestamp = new Date();
      await saveMessages({
        messages: [
          {
            id: message?.id || generateUUID(),
            chatId,
            role: "user",
            parts: [{ type: "text" as const, text: message?.text || "" }],
            attachments: [],
            createdAt: new Date(timestamp.getTime() - 1000),
          },
          {
            id: generateUUID(),
            chatId,
            role: "assistant",
            parts: [
              { type: "text" as const, text },
              ...(toolCalls?.map((tc) => ({
                type: "tool-call" as const,
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                args: (tc as any).args,
              })) || []),
            ],
            attachments: [],
            createdAt: timestamp,
          },
        ] as any,
      });
    },
  });

  await postAIResponse(thread, response.fullStream, response.text, platform);
}

export function attachHandlers(bot: Chat, platform: string, ownerUserId: string) {
  // ── Slack Assistants API ────────────────────────────────────────────────────
  if (platform === "slack") {
    bot.onAssistantThreadStarted(async (event) => {
      const slack = bot.getAdapter("slack") as SlackAdapter;
      await slack.setSuggestedPrompts(event.channelId, event.threadTs, [
        { title: "Get started", message: "What can you help me with?" },
        { title: "Summarize", message: "Summarize the current channel" },
      ]);
    });

    bot.onAssistantContextChanged(async (event) => {
      const slack = bot.getAdapter("slack") as SlackAdapter;
      await slack.setAssistantStatus(event.channelId, event.threadTs, "Updating context...");
    });
  }

  // ── @mention in unsubscribed channel thread ─────────────────────────────────
  // Fires on: Slack, Teams, GChat, Discord, GitHub, Linear when bot is @-mentioned.
  // Does NOT fire on: Telegram DMs, WhatsApp — those platforms route to onNewMessage.
  bot.onNewMention(async (thread, message) => {
    await handleFirstMessage(thread, message, platform, ownerUserId);
  });

  // ── Any message in an unsubscribed thread ───────────────────────────────────
  // FIX: This is the missing handler that caused Telegram (and WhatsApp DMs) to
  // receive zero responses. In a Telegram private chat the user can't @-mention
  // the bot — they just send a message. That never triggers onNewMention, so the
  // message was silently dropped.
  //
  // Chat SDK routing rules:
  //   1. Subscribed thread  → onSubscribedMessage
  //   2. @mention           → onNewMention
  //   3. Pattern match      → onNewMessage   ← this catches everything else
  //
  // We use /.+/ (any non-empty message) so commands like /start, plain text,
  // and everything else in a fresh Telegram or WhatsApp DM all get handled.
  bot.onNewMessage(/.+/, async (thread, message) => {
    await handleFirstMessage(thread, message, platform, ownerUserId);
  });

  // ── Follow-up messages in subscribed threads ────────────────────────────────
  bot.onSubscribedMessage(async (thread, message) => {
    try {
      await thread.startTyping("Thinking...");
    } catch { /* best-effort */ }

    const state = (await thread.state) as { chatId: string } | null;
    const chatId = state?.chatId;

    if (!chatId) {
      console.error("[bot-handlers] No chatId in thread state for follow-up");
      return;
    }

    const messages: any[] = [];
    for await (const msg of thread.allMessages) {
      messages.push(msg);
    }
    const history = await toAiMessages(messages);

    const response = await streamText({
      model: getLanguageModel("google/gemini-2.5-flash"),
      messages: history,
      tools: { getWeather },
      onFinish: async ({ text, toolCalls }) => {
        const timestamp = new Date();
        await saveMessages({
          messages: [
            {
              id: message?.id || generateUUID(),
              chatId,
              role: "user",
              parts: [{ type: "text" as const, text: message?.text || "" }],
              attachments: [],
              createdAt: new Date(timestamp.getTime() - 1000),
            },
            {
              id: generateUUID(),
              chatId,
              role: "assistant",
              parts: [
                { type: "text" as const, text },
                ...(toolCalls?.map((tc) => ({
                  type: "tool-call" as const,
                  toolCallId: tc.toolCallId,
                  toolName: tc.toolName,
                  args: (tc as any).args,
                })) || []),
              ],
              attachments: [],
              createdAt: timestamp,
            },
          ] as any,
        });
      },
    });

    await postAIResponse(thread, response.fullStream, response.text, platform);
  });
}