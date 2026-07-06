import { Client as QStashClient } from "@upstash/qstash";
import { Redis } from "@upstash/redis";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { triggerHeartbeatWorkflow } from "@/lib/workflow/client";

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

function getQStash(): QStashClient | null {
  if (!process.env.QSTASH_TOKEN) {
    return null;
  }
  return new QStashClient({ token: process.env.QSTASH_TOKEN });
}

function statusKey(userId: string) {
  return `agent:heartbeat:schedules:${userId}`;
}

function fallbackScheduleIds(userId: string) {
  return {
    heartbeatScheduleId: `hb-${userId}`,
    synthesisScheduleId: `syn-${userId}`,
    morningScheduleId: `morning-${userId}`,
    sandboxKeepaliveScheduleId: `sandbox-keepalive-${userId}`,
  };
}

async function setSchedulesPaused(userId: string, paused: boolean) {
  const qstash = getQStash();
  if (!qstash) {
    throw new Error("QSTASH_TOKEN not configured");
  }

  const redis = getRedis();
  const stored = redis
    ? await redis.get<Record<string, string>>(statusKey(userId))
    : null;
  const schedules = { ...fallbackScheduleIds(userId), ...(stored ?? {}) };
  const ids = Object.entries(schedules)
    .filter(([key, value]) => key.endsWith("ScheduleId") && !!value)
    .map(([, value]) => value);

  const settled = await Promise.allSettled(
    ids.map((schedule) =>
      paused
        ? qstash.schedules.pause({ schedule })
        : qstash.schedules.resume({ schedule })
    )
  );

  const failures = settled.filter((result) => result.status === "rejected");
  if (failures.length === ids.length) {
    throw new Error(
      `Failed to ${paused ? "pause" : "resume"} heartbeat schedules`
    );
  }

  if (redis) {
    await redis.set(`agent:status:${userId}:paused`, paused);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { action } = (await req.json()) as {
    action: "sync" | "pause" | "resume";
  };

  try {
    switch (action) {
      case "sync":
        if (!process.env.QSTASH_TOKEN || !process.env.BASE_URL) {
          return NextResponse.json(
            { error: "QStash workflow is not configured" },
            { status: 503 }
          );
        }
        {
          const triggered = await triggerHeartbeatWorkflow({ userId });
          if (!triggered) {
            return NextResponse.json(
              { error: "Heartbeat workflow could not be triggered" },
              { status: 503 }
            );
          }
        }
        break;

      case "pause": {
        await setSchedulesPaused(userId, true);
        break;
      }

      case "resume": {
        await setSchedulesPaused(userId, false);
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
