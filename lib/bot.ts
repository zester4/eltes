import { createDiscordAdapter } from "@chat-adapter/discord";
import { createGoogleChatAdapter } from "@chat-adapter/gchat";
import { createGitHubAdapter } from "@chat-adapter/github";
import { createLinearAdapter } from "@chat-adapter/linear";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createPostgresState } from "@chat-adapter/state-pg";
import { createTeamsAdapter } from "@chat-adapter/teams";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import { createResendAdapter } from "@resend/chat-sdk-adapter";
import { Chat, ConsoleLogger } from "chat";
import { getBotIntegration } from "@/lib/db/queries";
import { attachHandlers } from "./bot-handlers";

// FIX: Singleton state adapter — creating a new postgres pool on every webhook
// request exhausts the database connection limit quickly. Share a single pool
// across all invocations for the lifetime of the serverless worker instance.
let _state: ReturnType<typeof createPostgresState> | null = null;
function getSharedState() {
  if (!_state) {
    _state = createPostgresState({
      url: process.env.POSTGRES_URL || process.env.DATABASE_URL || "",
    });
  }
  return _state;
}

function parseJsonConfig(value: string, platform: string) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid ${platform} JSON credentials`);
  }
}

export async function buildUserBot(userId: string, platform: string) {
  const integration = await getBotIntegration({ userId, platform });

  if (!integration) {
    console.error(
      `[buildUserBot] No integration found for user ${userId} on ${platform}`
    );
    throw new Error("Integration missing");
  }

  const state = getSharedState();
  const extraConfig =
    (integration.extraConfig as Record<string, any> | null) ?? {};
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
        appTenantId: extraConfig.appTenantId,
        appType: extraConfig.appType || "SingleTenant",
      });
      break;

    case "gchat":
      adapter = createGoogleChatAdapter({
        credentials: parseJsonConfig(integration.botToken, "Google Chat"),
        googleChatProjectNumber: extraConfig.googleChatProjectNumber,
      });
      break;

    case "discord":
      adapter = createDiscordAdapter({
        botToken: integration.botToken,
        applicationId: extraConfig.applicationId,
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
      adapter = integration.signingSecret
        ? createGitHubAdapter({
            appId: integration.botToken,
            installationId: extraConfig.installationId
              ? Number(extraConfig.installationId)
              : undefined,
            privateKey: integration.signingSecret,
            webhookSecret: extraConfig.webhookSecret || "",
            botUserId: extraConfig.botUserId
              ? Number(extraConfig.botUserId)
              : undefined,
          })
        : createGitHubAdapter({
            token: integration.botToken,
            webhookSecret: extraConfig.webhookSecret || "",
            botUserId: extraConfig.botUserId
              ? Number(extraConfig.botUserId)
              : undefined,
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
        appSecret: integration.signingSecret || "",
        logger: new ConsoleLogger("info"),
        phoneNumberId: extraConfig.phoneNumberId,
        userName: "Etles",
        verifyToken: extraConfig.verifyToken,
      });
      break;

    case "resend": {
      adapter = createResendAdapter({
        apiKey: integration.botToken,
        webhookSecret: integration.signingSecret || "",
        fromAddress: extraConfig.fromAddress || "bot@etles.app",
        fromName: extraConfig.fromName || "Etles AI",
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
