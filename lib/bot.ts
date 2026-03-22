import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createTeamsAdapter } from "@chat-adapter/teams";
import { createGoogleChatAdapter } from "@chat-adapter/gchat";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createGitHubAdapter } from "@chat-adapter/github";
import { createLinearAdapter } from "@chat-adapter/linear";
import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import { createResendAdapter } from "@resend/chat-sdk-adapter";
import { createPostgresState } from "@chat-adapter/state-pg";
import { getBotIntegration } from "@/lib/db/queries";
import { attachHandlers } from "./bot-handlers";

// FIX: Singleton state adapter — creating a new postgres pool on every webhook
// request exhausts the database connection limit quickly. Share a single pool
// across all invocations for the lifetime of the serverless worker instance.
let _state: ReturnType<typeof createPostgresState> | null = null;
function getSharedState() {
  if (!_state) {
    _state = createPostgresState({ url: process.env.POSTGRES_URL || "" });
  }
  return _state;
}

export async function buildUserBot(userId: string, platform: string) {
  const integration = await getBotIntegration({ userId, platform });

  if (!integration) {
    console.error(`[buildUserBot] No integration found for user ${userId} on ${platform}`);
    throw new Error(`Integration missing`);
  }

  const state = getSharedState();
  let adapter;

  switch (platform) {
    case "slack":
      adapter = createSlackAdapter({
        botToken: integration.botToken,
        signingSecret: integration.signingSecret || "",
      });
      break;

    case "teams":
      adapter = createTeamsAdapter({
        appId: integration.botToken,
        appPassword: integration.signingSecret || "",
      });
      break;

    case "gchat":
      adapter = createGoogleChatAdapter({
        credentials: JSON.parse(integration.botToken),
      });
      break;

    case "discord":
      adapter = createDiscordAdapter({
        botToken: integration.botToken,
        publicKey: integration.signingSecret || undefined,
      });
      break;

    case "telegram":
      adapter = createTelegramAdapter({
        botToken: integration.botToken,
        secretToken: process.env.TELEGRAM_SECRET_TOKEN || undefined,
        mode: "webhook",
      });
      break;

    case "github":
      adapter = createGitHubAdapter({
        appId: integration.botToken,
        privateKey: integration.signingSecret || "",
        webhookSecret: (integration.extraConfig as any)?.webhookSecret || "",
      });
      break;

    case "linear":
      adapter = createLinearAdapter({
        webhookSecret: integration.signingSecret || "",
        apiKey: integration.botToken,
      });
      break;

    case "whatsapp":
      adapter = createWhatsAppAdapter({
        accessToken: integration.botToken,
        verifyToken: integration.signingSecret || "",
        phoneNumberId: (integration.extraConfig as any)?.phoneNumberId,
      });
      break;

    case "resend": {
      const config = integration.extraConfig as any;
      adapter = createResendAdapter({
        apiKey: integration.botToken,
        webhookSecret: integration.signingSecret || "",
        fromAddress: config?.fromAddress || "bot@etles.app",
        fromName: config?.fromName || "Etles AI",
      });
      break;
    }

    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  const bot = new Chat({
    userName: "Etles",
    adapters: { [platform]: adapter },
    state,
  });

  attachHandlers(bot, platform, userId);

  await bot.initialize();

  return bot;
}