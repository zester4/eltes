import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../(auth)/auth";
import { getUserBotIntegrations, saveBotIntegration } from "@/lib/db/queries";
import {
  registerTelegramWebhook,
  validateTelegramToken,
} from "@/lib/telegram/webhook-registration";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const integrations = await getUserBotIntegrations({ userId: session.user.id });
    
    // Obfuscate tokens before sending to client for security
    const safeIntegrations = integrations.map((i: any) => ({
      ...i,
      botToken: i.botToken ? "••••••••" + i.botToken.slice(-4) : "",
      signingSecret: i.signingSecret ? "••••••••" + i.signingSecret.slice(-4) : "",
    }));

    return NextResponse.json(safeIntegrations);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch integrations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { platform, botToken, signingSecret, extraConfig } = await req.json();
    
    if (!platform || !botToken) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (botToken.includes("••••••••") || signingSecret?.includes("••••••••")) {
      return NextResponse.json(
        { error: "Please enter new keys to update configuration." },
        { status: 400 },
      );
    }

    // Validate Telegram token before saving — ensures token works and keys are stored correctly
    if (platform === "telegram") {
      const validation = await validateTelegramToken(botToken);
      if (!validation.ok) {
        return NextResponse.json(
          { error: `Invalid Telegram bot token: ${validation.error}` },
          { status: 400 },
        );
      }
    }

    await saveBotIntegration({
      userId: session.user.id,
      platform,
      botToken,
      signingSecret,
      extraConfig
    });

    if (platform === "telegram") {
      const baseUrl = process.env.BASE_URL || new URL(req.url).origin;
      const isLocalhost =
        baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
      if (isLocalhost) {
        return NextResponse.json(
          {
            success: false,
            error:
              "BASE_URL must be a public URL for Telegram. Set BASE_URL in .env to your ngrok or deployment URL (e.g. https://xxx.ngrok.io). Telegram cannot reach localhost.",
          },
          { status: 400 },
        );
      }
      const result = await registerTelegramWebhook(
        botToken,
        session.user.id,
        baseUrl,
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: `Saved but webhook registration failed: ${result.error}` },
          { status: 207 }, // Partial success
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save integration" }, { status: 500 });
  }
}
