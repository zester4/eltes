/**
 * Telegram callback query handler.
 * Route: POST /api/telegram/callback/[userId]
 *
 * Handles inline keyboard button presses (Approve / Edit / Reject) for
 * pending drafts that Etles queued via the queueApproval tool.
 */
 
import { Redis } from "@upstash/redis";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { getBotIntegration, saveMessages } from "@/lib/db/queries";
import {
  answerCallbackQuery,
  editMessageText,
} from "@/lib/telegram/api";
import { generateUUID } from "@/lib/utils";
import { type PendingApproval, approvalKey } from "../route-utils";
 
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;
 
const composio = new Composio({ provider: new VercelProvider() });
 
// ── Types ─────────────────────────────────────────────────────────────────────
 
interface TelegramCallbackQuery {
  id: string;
  from: { id: number };
  message?: { message_id: number; chat: { id: number } };
  data?: string;
}
 
interface TelegramUpdate {
  update_id: number;
  callback_query?: TelegramCallbackQuery;
  message?: { text?: string; chat: { id: number }; from?: { id: number } };
}
 
// ── Handler ───────────────────────────────────────────────────────────────────
 
export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: ownerUserId } = await params;
 
  // Verify secret token
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
 
  // Only handle callback queries (inline button taps)
  const cq = update.callback_query;
  if (!cq?.data) return new Response("OK", { status: 200 });
 
  const integration = await getBotIntegration({
    userId: ownerUserId,
    platform: "telegram",
  });
  if (!integration) return new Response("OK", { status: 200 });
 
  const botToken = integration.botToken;
  const [action, draftId] = cq.data.split(":", 2);
  const telegramChatId = cq.message?.chat.id ?? 0;
  const messageId = cq.message?.message_id ?? 0;
 
  if (!draftId || !telegramChatId) {
    await answerCallbackQuery(botToken, cq.id, "Invalid action.");
    return new Response("OK", { status: 200 });
  }
 
  // Load the pending approval from Redis
  if (!redis) {
    await answerCallbackQuery(botToken, cq.id, "Storage unavailable.");
    return new Response("OK", { status: 200 });
  }
 
  const raw = await redis.get<string | PendingApproval>(approvalKey(draftId));
  if (!raw) {
    await answerCallbackQuery(botToken, cq.id, "This approval has expired.", true);
    await editMessageText(
      botToken,
      telegramChatId,
      messageId,
      "⏰ <i>This approval request has expired.</i>"
    );
    return new Response("OK", { status: 200 });
  }
 
  const approval: PendingApproval = typeof raw === "string" ? JSON.parse(raw) : (raw as PendingApproval);
 
  // ── APPROVE ───────────────────────────────────────────────────────────────
  if (action === "approve") {
    await answerCallbackQuery(botToken, cq.id, "✅ Executing...");
    await editMessageText(
      botToken,
      telegramChatId,
      messageId,
      `✅ <b>Approved</b> — executing <i>${escapeHtml(approval.summary)}</i>...`
    );
 
    try {
      // Load Composio tools and execute
      const session = await composio.create(ownerUserId, { manageConnections: true });
      const tools = await session.tools();
      const tool = (tools as any)[approval.executionTool];
 
      let result = "Done.";
      if (tool?.execute) {
        const execResult = await tool.execute(approval.executionInput, {} as any);
        result = typeof execResult === "string"
          ? execResult
          : JSON.stringify(execResult).slice(0, 300);
      }
 
      await editMessageText(
        botToken,
        telegramChatId,
        messageId,
        `✅ <b>Done:</b> ${escapeHtml(approval.summary)}\n\n<i>${escapeHtml(result)}</i>`
      );
 
      // Save execution to chat history
      await saveMessages({
        messages: [{
          id: generateUUID(),
          chatId: approval.chatId,
          role: "assistant",
          parts: [{ type: "text", text: `✅ Executed: ${approval.summary}\n\nResult: ${result}` }],
          attachments: [],
          createdAt: new Date(),
        }] as any,
      });
    } catch (err: any) {
      await editMessageText(
        botToken,
        telegramChatId,
        messageId,
        `❌ <b>Failed:</b> ${escapeHtml(err?.message ?? "Unknown error")}`
      );
    }
 
    await redis.del(approvalKey(draftId));
    return new Response("OK", { status: 200 });
  }
 
  // ── REJECT ────────────────────────────────────────────────────────────────
  if (action === "reject") {
    await answerCallbackQuery(botToken, cq.id, "❌ Rejected.");
    await editMessageText(
      botToken,
      telegramChatId,
      messageId,
      `❌ <b>Rejected:</b> <i>${escapeHtml(approval.summary)}</i>`
    );
 
    await saveMessages({
      messages: [{
        id: generateUUID(),
        chatId: approval.chatId,
        role: "assistant",
        parts: [{ type: "text", text: `Action rejected by user: ${approval.summary}` }],
        attachments: [],
        createdAt: new Date(),
      }] as any,
    });
 
    await redis.del(approvalKey(draftId));
    return new Response("OK", { status: 200 });
  }
 
  // ── EDIT ──────────────────────────────────────────────────────────────────
  if (action === "edit") {
    await answerCallbackQuery(botToken, cq.id, "📝 Reply with your changes.");
    // Store edit state so the next message from this user is treated as the edit
    await redis.set(
      `edit_pending:${ownerUserId}:${telegramChatId}`,
      JSON.stringify({ draftId, summary: approval.summary }),
      { ex: 60 * 10 } // 10 min window to reply
    );
    await editMessageText(
      botToken,
      telegramChatId,
      messageId,
      `📝 <b>Editing:</b> <i>${escapeHtml(approval.summary)}</i>\n\nReply with your changes and I'll revise it.`
    );
    return new Response("OK", { status: 200 });
  }
 
  await answerCallbackQuery(botToken, cq.id);
  return new Response("OK", { status: 200 });
}
 
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}
