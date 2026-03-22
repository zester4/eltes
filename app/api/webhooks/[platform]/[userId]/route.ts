import { buildUserBot } from "@/lib/bot";
import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";

type RouteParams = { params: Promise<{ platform: string; userId: string }> };

async function handleWebhook(req: NextRequest, params: RouteParams["params"]) {
  const { platform, userId } = await params;

  const bot = await buildUserBot(userId, platform);

  const handler = bot.webhooks[platform as keyof typeof bot.webhooks];

  if (!handler) {
    console.error(`[Webhook] No handler for platform: ${platform}`);
    return NextResponse.json({ error: "Invalid platform webhook" }, { status: 400 });
  }

  console.log(`[Webhook] ${req.method} → ${platform} for user ${userId}`);

  // FIX: Pass waitUntil so the SDK can keep async work (LLM calls, thread.post, etc.)
  // running after the HTTP 200 has been returned to the platform.
  //
  // Without this, on Next.js/Vercel the serverless function exits immediately
  // after returning 200 — BEFORE any bot logic, AI calls, or thread.post()
  // executes. Result: platforms get a 200 (so no retries) but the bot is
  // completely silent. This was why Telegram DMs received zero responses.
  //
  // `after()` from next/server is the Next.js 15 equivalent of waitUntil for
  // serverless environments. It schedules work to run after the response is sent.
  return handler(req, {
    waitUntil: (task: Promise<unknown>) => after(() => task),
  });
}

// GET — needed for WhatsApp & some other platforms that send a verification
// challenge via GET before delivering any events.
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    return await handleWebhook(req, params);
  } catch (error: any) {
    console.error(`[Webhook GET ERROR] ${req.url}:`, error);
    return NextResponse.json(
      {
        error: "Webhook verification failed",
        details: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    return await handleWebhook(req, params);
  } catch (error: any) {
    console.error(`[Webhook POST ERROR] ${req.url}:`, error);
    return NextResponse.json(
      {
        error: "Webhook processing failed",
        details: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}