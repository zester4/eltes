import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { auth } from "@/app/(auth)/auth";
import {
  triggerHeartbeatWorkflow,
  pauseUserCrons,
  resumeUserCrons,
} from "@/lib/workflow/client";

function getRedis(): Redis | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { action } = await req.json() as { action: "sync" | "pause" | "resume" };

  try {
    switch (action) {
      case "sync":
        await triggerHeartbeatWorkflow({ userId });
        break;

      case "pause": {
        await pauseUserCrons(userId);
        const redis = getRedis();
        if (redis) {
          await redis.set(`agent:status:${userId}:paused`, true);
        }
        break;
      }

      case "resume": {
        await resumeUserCrons(userId);
        const redis = getRedis();
        if (redis) {
          await redis.set(`agent:status:${userId}:paused`, false);
        }
        break;
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, action });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Agent Action] ${action} failed:`, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
