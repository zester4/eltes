/**
 * queueApproval tool.
 *
 * Etles calls this instead of directly executing irreversible actions.
 * It stores the draft in Redis and sends a Telegram inline keyboard
 * (Approve / Edit / Reject) to the user.
 *
 * If the user has no Telegram connected, it falls back to saving a
 * pending approval card in the chat UI.
 */

import { tool } from "ai";
import { z } from "zod";
import { Redis } from "@upstash/redis";
import { getBotIntegration } from "@/lib/db/queries";
import {
  sendMessageWithInlineKeyboard,
  type InlineKeyboardButton,
} from "@/lib/telegram/api";
import {
  storePendingApproval,
  type PendingApproval,
} from "@/app/api/telegram/callback/route-utils";
import { generateUUID } from "@/lib/utils";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

export const queueApproval = ({
  userId,
  chatId,
}: {
  userId: string;
  chatId: string;
}) =>
  tool({
    description:
      "Queue an action for user approval before executing it. Use this for ANY irreversible action: " +
      "sending emails, making payments, posting content, creating calendar events, assigning tasks, or anything that affects the outside world. " +
      "The user gets a Telegram message with Approve / Edit / Reject buttons. " +
      "Do NOT use for read-only operations (fetching data, searching).",
    inputSchema: z.object({
      type: z
        .enum(["email", "payment", "post", "task", "calendar", "generic"])
        .describe("The type of action being queued."),
      summary: z
        .string()
        .describe(
          "A short human-readable description of what will happen on approval. " +
          "E.g. 'Send email to john@example.com: Re: Invoice #1234' or 'Pay $500 to Acme Corp via Wise'"
        ),
      preview: z
        .string()
        .optional()
        .describe(
          "Full text preview of the action (e.g. the email body, post text). " +
          "Shown in Telegram before user approves."
        ),
      executionTool: z
        .string()
        .describe(
          "The exact Composio tool name to call when approved. " +
          "E.g. 'GMAIL_SEND_EMAIL', 'WISE_CREATE_TRANSFER', 'TWITTER_CREATE_TWEET'"
        ),
      executionInput: z
        .record(z.unknown())
        .describe("The exact arguments to pass to executionTool when approved."),
    }),
    execute: async ({ type, summary, preview, executionTool, executionInput }) => {
      const draftId = generateUUID();

      const emoji: Record<string, string> = {
        email: "📧",
        payment: "💸",
        post: "📣",
        task: "✅",
        calendar: "📅",
        generic: "⚡",
      };

      // Build Telegram message
      const icon = emoji[type] ?? "⚡";
      const previewSection = preview
        ? `\n\n<blockquote>${preview.slice(0, 600)}${preview.length > 600 ? "…" : ""}</blockquote>`
        : "";
      const telegramText =
        `${icon} <b>Approval needed</b>\n\n${summary}${previewSection}\n\n<i>What would you like to do?</i>`;

      const buttons: InlineKeyboardButton[][] = [
        [
          { text: "✅ Approve", callback_data: `approve:${draftId}` },
          { text: "✏️ Edit", callback_data: `edit:${draftId}` },
          { text: "❌ Reject", callback_data: `reject:${draftId}` },
        ],
      ];

      // Get Telegram integration
      const integration = await getBotIntegration({ userId, platform: "telegram" });
      let messageId: number | null = null;
      let telegramChatId: number | null = null;

      if (integration && redis) {
        // Find active Telegram chat
        const keys = await redis.keys(`tg:chat:${userId}:*`);
        if (keys.length > 0) {
          telegramChatId = Number(keys[0].split(":").at(-1));
          if (!isNaN(telegramChatId)) {
            messageId = await sendMessageWithInlineKeyboard(
              integration.botToken,
              telegramChatId,
              telegramText,
              buttons
            );
          }
        }
      }

      // Store in Redis
      const approval: Omit<PendingApproval, "messageId"> = {
        draftId,
        type,
        summary,
        executionTool,
        executionInput: executionInput as Record<string, unknown>,
        chatId,
        telegramChatId: telegramChatId ?? 0,
      };

      await storePendingApproval(approval, messageId);

      const hasTelegram = Boolean(integration && telegramChatId && messageId);
      return {
        success: true,
        draftId,
        status: "pending_approval",
        deliveredVia: hasTelegram ? "telegram" : "chat",
        message: hasTelegram
          ? `Approval request sent to your Telegram. Tap Approve when ready.`
          : `Action queued for approval. Tap Approve in the chat.`,
      };
    },
  });
