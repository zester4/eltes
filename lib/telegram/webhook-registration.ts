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
  const callbackUrl = `${baseUrl}/api/telegram/callback/${userId}`;

  // We register the main webhookUrl. 
  // IMPORTANT: Telegram only supports ONE webhook URL per bot.
  // We should either:
  // 1. Point the webhook to a single router that handles both messages and callbacks.
  // 2. Use the existing /api/telegram/[userId] to handle BOTH messages and callbacks.
  //
  // Given the user's feedback, we should point the webhook to a URL that handles everything.
  // However, the instructions mentioned adding the callback route separately.
  // Since Telegram only allows ONE webhook URL, we will point it to the main handler
  // and ensure that handler can route callback_queries if needed, OR we point it
  // to a new consolidated handler.
  //
  // Actually, looking at the user's provided code for the callback handler:
  // Route: POST /api/telegram/callback/[userId]
  // And the existing handler:
  // Route: POST /api/telegram/[userId]
  //
  // If we want to support both, we must have ONE endpoint.
  // Let's consolidate them or ensure the main one redirects/proxies.
  // The user suggested: "Or more simply: handle callback_query in the existing /api/telegram/[userId] route"
  //
  // But they also provided a full separate route for callbacks.
  // To use the separate route for callbacks while keeping the other for messages, 
  // we would need two bots or a single router.
  //
  // Let's assume the user wants the main webhook to be the one that handles everything, 
  // or they want us to register the callback one? No, messages would stop working.
  //
  // BEST APPROACH: Register the main /api/telegram/[userId] as the webhook,
  // AND update it to handle callback_queries by forwarding them or implementing the logic.
  //
  // WAIT, the user's feedback said: "the update you made in 'lib/telegram/webhook-registration.ts' did not reflect".
  // Looking at my previous attempt, I just put:
  // allowed_updates: ["message", "callback_query"]
  // which WAS correct for a single webhook.
  //
  // Ah, I see. I might have failed to actually apply the change or it didn't "reflect" 
  // because I didn't change the URL to something that handles both?
  //
  // Actually, the user's feedback includes a comment:
  // "// Then register it using setWebhook allowed_updates: ["callback_query", "message"]"
  // I did exactly that.
  //
  // Let's try to be more explicit and maybe there was a misunderstanding of "reflect".
  // I'll re-apply the exact intended state.

  const body: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
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