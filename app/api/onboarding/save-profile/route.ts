import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { Index } from "@upstash/vector";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    name?: string;
    role?: string;
    painPoints?: string[];
    telegramChatId?: string;
    automationPreference?: string;
  };

  try {
    const index = new Index({
      url: process.env.UPSTASH_VECTOR_REST_URL!,
      token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
    });
    const ns = index.namespace(`memory-${session.user.id}`);

    const upserts: Promise<unknown>[] = [];

    if (body.name) {
      upserts.push(
        ns.upsert({
          id: "user_name",
          data: `User's name is ${body.name}.`,
          metadata: {
            key: "user_name",
            content: `User's name is ${body.name}.`,
            tags: ["profile", "name"],
            savedAt: new Date().toISOString(),
          },
        })
      );
    }

    if (body.role) {
      upserts.push(
        ns.upsert({
          id: "user_role",
          data: `User's primary role is ${body.role}.`,
          metadata: {
            key: "user_role",
            content: `User's primary role is ${body.role}.`,
            tags: ["profile", "role"],
            savedAt: new Date().toISOString(),
          },
        })
      );
    }

    if (body.painPoints && body.painPoints.length > 0) {
      const painPointStr = body.painPoints.join(", ");
      upserts.push(
        ns.upsert({
          id: "user_pain_points",
          data: `User's biggest time drains are: ${painPointStr}.`,
          metadata: {
            key: "user_pain_points",
            content: `User's biggest time drains are: ${painPointStr}.`,
            tags: ["profile", "preferences"],
            savedAt: new Date().toISOString(),
          },
        })
      );
    }

    if (body.telegramChatId) {
      upserts.push(
        ns.upsert({
          id: "telegram_chat_id",
          data: `User's Telegram Chat ID is ${body.telegramChatId}. Use this to push alerts to Telegram.`,
          metadata: {
            key: "telegram_chat_id",
            content: `User's Telegram Chat ID is ${body.telegramChatId}. Use this to push alerts to Telegram.`,
            tags: ["profile", "telegram", "contact"],
            savedAt: new Date().toISOString(),
          },
        })
      );
    }

    if (body.automationPreference) {
      upserts.push(
        ns.upsert({
          id: "automation_preference",
          data: `User requested a recurring automation: ${body.automationPreference}. Handle this during heartbeat.`,
          metadata: {
            key: "automation_preference",
            content: `User requested a recurring automation: ${body.automationPreference}. Handle this during heartbeat.`,
            tags: ["profile", "automation", "preferences"],
            savedAt: new Date().toISOString(),
          },
        })
      );
    }

    await Promise.all(upserts);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[save-profile] Failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
