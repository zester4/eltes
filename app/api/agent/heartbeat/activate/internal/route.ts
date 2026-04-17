/**
 * app/api/agent/heartbeat/activate/internal/route.ts
 *
 * Internal version of the heartbeat activation endpoint.
 * Called by the activateHeartbeat tool (which runs in a server-side tool call
 * and doesn't have access to the user's session cookie).
 *
 * Authentication: x-agent-secret header (same as /api/agent/delegate)
 * User identity: x-user-id header
 *
 * This route is NOT accessible from the browser — it's only called
 * from the server-side activateHeartbeat tool.
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@upstash/qstash";
import { Redis } from "@upstash/redis";

const HOURLY_CRON = "0 * * * *";
const SYNTHESIS_CRON = "0 8 * * 1";
const DEFAULT_MORNING_HOUR = 7;

function getQStash() {
  if (!process.env.QSTASH_TOKEN) return null;
  return new Client({ token: process.env.QSTASH_TOKEN });
}

function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN)
    return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function statusKey(userId: string) {
  return `agent:heartbeat:schedules:${userId}`;
}

export async function POST(req: NextRequest) {
  // Verify internal secret
  const secret = req.headers.get("x-agent-secret");
  const expected = process.env.AGENT_DELEGATE_SECRET ?? "dev-internal";
  if (secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Missing x-user-id" }, { status: 400 });
  }

  const qstash = getQStash();
  if (!qstash) {
    return NextResponse.json(
      { error: "QSTASH_TOKEN not configured" },
      { status: 503 },
    );
  }

  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    return NextResponse.json(
      { error: "BASE_URL not set" },
      { status: 503 },
    );
  }

  let body: { morningHour?: number } = {};
  try {
    body = await req.json();
  } catch { /* optional */ }

  const morningHour = body.morningHour ?? DEFAULT_MORNING_HOUR;
  const morningCron = `0 ${morningHour} * * *`;
  const heartbeatSecret = process.env.AGENT_DELEGATE_SECRET ?? "dev-internal";
  const results: Record<string, string> = {};

  // Hourly heartbeat
  try {
    const heartbeat = await (qstash.schedules as any).create({
      destination: `${baseUrl}/api/agent/heartbeat`,
      cron: HOURLY_CRON,
      body: JSON.stringify({ userId }),
      headers: {
        "Content-Type": "application/json",
        "x-heartbeat-secret": heartbeatSecret,
      },
      retries: 2,
      deduplicationId: `hb-${userId}`,
    });
    results.heartbeatScheduleId = heartbeat.scheduleId;
  } catch (err: any) {
    console.error("[Heartbeat Internal] Hourly schedule error:", err?.message);
  }

  // Weekly synthesis
  try {
    const synthesis = await (qstash.schedules as any).create({
      destination: `${baseUrl}/api/agent/heartbeat`,
      cron: SYNTHESIS_CRON,
      body: JSON.stringify({ userId, type: "weekly_synthesis" }),
      headers: {
        "Content-Type": "application/json",
        "x-heartbeat-secret": heartbeatSecret,
      },
      retries: 2,
      deduplicationId: `syn-${userId}`,
    });
    results.synthesisScheduleId = synthesis.scheduleId;
  } catch (err: any) {
    console.error("[Heartbeat Internal] Synthesis schedule error:", err?.message);
  }

  // Morning briefing
  try {
    const morning = await (qstash.schedules as any).create({
      destination: `${baseUrl}/api/agent/morning/workflow`,
      cron: morningCron,
      body: JSON.stringify({ userId }),
      headers: {
        "Content-Type": "application/json",
        "x-heartbeat-secret": heartbeatSecret,
      },
      retries: 2,
      deduplicationId: `morning-${userId}`,
    });
    results.morningScheduleId = morning.scheduleId;
    results.morningCron = morningCron;
  } catch (err: any) {
    console.error("[Heartbeat Internal] Morning schedule error:", err?.message);
  }

  // Persist to Redis
  const redis = getRedis();
  if (redis && Object.keys(results).length > 0) {
    await redis.set(statusKey(userId), JSON.stringify(results), {
      ex: 60 * 60 * 24 * 365,
    });
  }

  const activated = Object.values(results).some((v) => v && !v.includes(" "));

  return NextResponse.json({
    ok: activated,
    schedules: results,
    message: activated
      ? `Background intelligence activated for user ${userId.slice(0, 8)}…`
      : "Activation failed — check logs.",
  });
}