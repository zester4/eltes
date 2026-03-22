/**
 * Telegram Webhook Auto-Registration
 * ─────────────────────────────────────────────────────────────────────────────
 * Called from your POST /api/bot-integrations route when platform === "telegram".
 * Automatically registers the webhook URL with Telegram so users don't have
 * to run curl manually.
 *
 * The webhook URL points to our direct handler: /api/telegram/[userId]
 * (NOT the Chat SDK webhooks route — that's for other platforms)
 */

interface TelegramSetWebhookResult {
  ok: boolean;
  description?: string;
}

/**
 * Registers the webhook URL with Telegram's Bot API.
 * Call this server-side immediately after saving a Telegram bot integration.
 *
 * @param botToken  - The bot token from BotFather (e.g. "123456:ABC-DEF...")
 * @param userId    - The app user ID who owns this integration
 * @param baseUrl   - The app origin (e.g. "https://etles.app")
 * @returns         - { ok, error? }
 */
export async function registerTelegramWebhook(
  botToken: string,
  userId: string,
  baseUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const webhookUrl = `${baseUrl}/api/telegram/${userId}`;

  const body: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true, // ignore messages sent while webhook was not set
  };

  // Include secret token if configured — adds an extra verification layer
  if (process.env.TELEGRAM_SECRET_TOKEN) {
    body.secret_token = process.env.TELEGRAM_SECRET_TOKEN;
  }

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  const data: TelegramSetWebhookResult = await res.json();

  if (!data.ok) {
    console.error("[Telegram] setWebhook failed:", data.description);
    return { ok: false, error: data.description };
  }

  console.log(`[Telegram] Webhook registered: ${webhookUrl}`);
  return { ok: true };
}

/**
 * Gets the currently registered webhook info for a bot.
 * Useful for debugging.
 */
export async function getTelegramWebhookInfo(botToken: string) {
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/getWebhookInfo`,
  );
  return res.json();
}

/**
 * Removes the webhook (switches bot to polling mode).
 * Call this if the user deletes their Telegram integration.
 */
export async function deleteTelegramWebhook(botToken: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {
    method: "POST",
  });
}

/**
 * Validates a Telegram bot token by calling getMe.
 * Returns { ok: true } if valid, { ok: false, error } if invalid.
 */
export async function validateTelegramToken(
  botToken: string,
): Promise<{ ok: boolean; error?: string; username?: string }> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const data = await res.json();
  if (!data.ok) {
    return { ok: false, error: data.description || "Invalid bot token" };
  }
  return { ok: true, username: data.result?.username };
}