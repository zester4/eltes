/**
 * app/api/agent/heartbeat/activate/route.ts
 *
 * Activates (or deactivates) the proactive background intelligence system
 * for a specific user by creating per-user QStash cron schedules.
 *
 * GET  → returns activation status for the current user
 * POST → activates heartbeat + synthesis + (optionally) morning briefing
 * DELETE → deactivates all background schedules for the user
 *
 * Called from:
 *   1. The onboarding specialist agent via the activateHeartbeat tool
 *   2. The settings UI when a user toggles "Background Intelligence"
 *
 * QStash deduplicationId ensures we never create duplicate schedules —
 * calling POST twice is safe, the second call is a no-op.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { Client } from "@upstash/qstash";
import { Redis } from "@upstash/redis";

const HOURLY_CRON = "0 * * * *"; // every hour
const SYNTHESIS_CRON = "0 8 * * 1"; // Mondays at 8am UTC

const DEFAULT_MORNING_HOUR = 7; // 7am UTC default

function getQStash() {
  if (!process.env.QSTASH_TOKEN) return null;
  return new Client({ token: process.env.QSTASH_TOKEN });
}

function getRedis() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  )
    return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function statusKey(userId: string) {
  return `agent:heartbeat:schedules:${userId}`;
}

// ── GET: activation status ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  const agentSecret = req.headers.get("x-agent-secret") || req.headers.get("x-heartbeat-secret");
  const validSecret = process.env.AGENT_DELEGATE_SECRET || process.env.AUTH_SECRET || "dev-internal";
  const isAgent = agentSecret === validSecret;
  const userId = isAgent ? req.headers.get("x-user-id") : session?.user?.id;

  if (!userId) {
    return NextResponse.json({ 
      error: "Unauthorized",
      message: isAgent ? "Missing x-user-id header" : "No active session and secret mismatch"
    }, { status: 401 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ active: false, error: "Redis not configured" });
  }

  const stored = await redis.get<Record<string, string>>(statusKey(userId));

  return NextResponse.json({
    active: !!stored?.heartbeatScheduleId,
    schedules: stored ?? null,
    workflowEnabled: Boolean(process.env.QSTASH_TOKEN && process.env.BASE_URL),
  });
}

// ── POST: activate ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  const agentSecret = req.headers.get("x-agent-secret") || req.headers.get("x-heartbeat-secret");
  const validSecret = process.env.AGENT_DELEGATE_SECRET || process.env.AUTH_SECRET || "dev-internal";
  const isAgent = agentSecret === validSecret;
  const userId = isAgent ? req.headers.get("x-user-id") : session?.user?.id;

  if (!userId) {
    return NextResponse.json({ 
      error: "Unauthorized",
      message: isAgent ? "Missing x-user-id header" : "No active session and secret mismatch"
    }, { status: 401 });
  }

  const qstash = getQStash();
  if (!qstash) {
    return NextResponse.json(
      { error: "QSTASH_TOKEN not configured. Add it to enable background intelligence." },
      { status: 503 },
    );
  }

  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    return NextResponse.json(
      { error: "BASE_URL not set. Required for heartbeat callbacks." },
      { status: 503 },
    );
  }

  let body: { morningHour?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* optional body */
  }

  const morningHour = body.morningHour ?? DEFAULT_MORNING_HOUR;
  const morningCron = `0 ${morningHour} * * *`;
  const heartbeatSecret = process.env.AGENT_DELEGATE_SECRET ?? "dev-internal";

  const results: Record<string, string> = {};

  // ── 1. Hourly heartbeat schedule ─────────────────────────────────────────
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
      deduplicationId: `heartbeat-hourly-${userId}`,
    });
    results.heartbeatScheduleId = heartbeat.scheduleId;
  } catch (err: any) {
    console.error("[Heartbeat Activate] Failed to create heartbeat schedule:", err?.message);
    // Don't fail the whole activation — log and continue
  }

  // ── 2. Weekly synthesis schedule ──────────────────────────────────────────
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
      deduplicationId: `heartbeat-synthesis-${userId}`,
    });
    results.synthesisScheduleId = synthesis.scheduleId;
  } catch (err: any) {
    console.error("[Heartbeat Activate] Failed to create synthesis schedule:", err?.message);
  }

  // ── 3. Morning briefing schedule ──────────────────────────────────────────
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
      deduplicationId: `heartbeat-morning-${userId}`,
    });
    results.morningScheduleId = morning.scheduleId;
    results.morningCron = morningCron;
  } catch (err: any) {
    console.error("[Heartbeat Activate] Failed to create morning schedule:", err?.message);
  }

  // ── 4. Sandbox keep-alive schedule ──────────────────────────────────────────
  try {
    const sandboxKeepalive = await (qstash.schedules as any).create({
      destination: `${baseUrl}/api/agent/sandbox/keepalive`,
      cron: "0 3 1,21 * *", // 3am UTC on the 1st and 21st of every month (every ~20 days)
      body: JSON.stringify({ userId }),
      headers: {
        "Content-Type": "application/json",
        "x-agent-secret": heartbeatSecret,
      },
      retries: 3,
      deduplicationId: `sandbox-keepalive-${userId}`,
    });
    results.sandboxKeepaliveScheduleId = sandboxKeepalive.scheduleId;
  } catch (err: any) {
    console.error(
      "[Heartbeat Activate] Failed to create sandbox keep-alive schedule:",
      err?.message,
    );
  }

  // ── 5. Persist schedule IDs in Redis for status + deactivation ────────────
  const redis = getRedis();
  if (redis && Object.keys(results).length > 0) {
    await redis.set(statusKey(userId), JSON.stringify(results), {
      ex: 60 * 60 * 24 * 365, // 1 year
    });
  }

  const activated = Object.keys(results).some((k) => k.endsWith("ScheduleId"));

  return NextResponse.json({
    ok: activated,
    schedules: results,
    message: activated
      ? `Background intelligence activated. Hourly heartbeat + weekly synthesis${results.morningScheduleId ? " + morning briefing" : ""}${results.sandboxKeepaliveScheduleId ? " + sandbox keep-alive" : ""} running.`
      : "Activation partially failed — check server logs.",
  });
}

// ── DELETE: deactivate ────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const session = await auth();
  const agentSecret = req.headers.get("x-agent-secret") || req.headers.get("x-heartbeat-secret");
  const validSecret = process.env.AGENT_DELEGATE_SECRET || process.env.AUTH_SECRET || "dev-internal";
  const isAgent = agentSecret === validSecret;
  const userId = isAgent ? req.headers.get("x-user-id") : session?.user?.id;

  if (!userId) {
    return NextResponse.json({ 
      error: "Unauthorized",
      message: isAgent ? "Missing x-user-id header" : "No active session and secret mismatch"
    }, { status: 401 });
  }

  const qstash = getQStash();
  const redis = getRedis();

  if (!qstash) {
    return NextResponse.json({ error: "QStash not configured" }, { status: 503 });
  }

  // Load stored schedule IDs
  const stored = redis
    ? await redis.get<Record<string, string>>(statusKey(userId))
    : null;

  const deleted: string[] = [];
  const errors: string[] = [];

  if (stored) {
    for (const [key, scheduleId] of Object.entries(stored)) {
      if (!key.endsWith("ScheduleId")) continue;
      try {
        await qstash.schedules.delete(scheduleId);
        deleted.push(scheduleId);
      } catch (err: any) {
        errors.push(`${scheduleId}: ${err?.message ?? "unknown"}`);
      }
    }
  }

  // Clear Redis status
  if (redis) {
    await redis.del(statusKey(userId));
  }

  return NextResponse.json({
    ok: true,
    deleted,
    errors: errors.length > 0 ? errors : undefined,
    message: `Deactivated ${deleted.length} schedule(s). Background intelligence is now off.`,
  });
}