/**
 * app/api/agent/sandbox/keepalive/route.ts
 *
 * QStash cron endpoint that pings each user's persistent sandbox every 20 days
 * to prevent E2B's 30-day paused-sandbox expiry from deleting the state.
 *
 * How to schedule (run once at setup or in onboarding):
 *
 *   const client = new Client({ token: process.env.QSTASH_TOKEN })
 *   await client.schedules.create({
 *     destination: `${BASE_URL}/api/agent/sandbox/keepalive`,
 *     cron: "0 3 * /20 *",   // every 20 days at 3am UTC
 *     body: JSON.stringify({ userId }),
 *     headers: { "Content-Type": "application/json" },
 *     retries: 3,
 *   })
 *
 * Or call this endpoint directly from the heartbeat workflow to keep it simple —
 * piggyback on the existing hourly heartbeat, skip if last keepalive < 20 days ago.
 *
 * Endpoint accepts:
 *   { userId: string }              — keep-alive for one user
 *   { all: true }                   — keep-alive for all users with a sandbox (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { Redis } from "@upstash/redis";
import { keepAlive } from "@/lib/persistent-sandbox/client";

const receiver = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY ?? "",
    })
  : null;

// Track last keep-alive per user to avoid hammering E2B
const KEEPALIVE_INTERVAL_SECONDS = 60 * 60 * 24 * 20; // 20 days
function lastKeepaliveKey(userId: string) {
  return `agent:sandbox:keepalive:${userId}`;
}

export async function POST(req: NextRequest) {
  // ── Auth: verify QStash signature (skip in dev) ───────────────────────────
  const body = await req.text();

  if (receiver) {
    const signature = req.headers.get("upstash-signature") ?? "";
    const isValid = await receiver
      .verify({ signature, body, clockTolerance: 5 })
      .catch(() => false);

    if (!isValid) {
      // Also allow internal calls with AGENT_DELEGATE_SECRET
      const secret = req.headers.get("x-agent-secret");
      const expected = process.env.AGENT_DELEGATE_SECRET ?? "dev-internal";
      if (secret !== expected) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
  }

  let parsed: { userId?: string; all?: boolean };
  try {
    parsed = JSON.parse(body) as { userId?: string; all?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const redis =
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
      ? new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN,
        })
      : null;

  if (parsed.all && redis) {
    // Find all users with a sandbox key and ping them
    const keys = await redis.keys("agent:sandbox:*").catch(() => [] as string[]);
    const userIds = keys
      .filter((k) => !k.includes("keepalive"))
      .map((k) => k.replace("agent:sandbox:", ""));

    const results = await Promise.allSettled(
      userIds.map(async (uid) => {
        if (!redis) return;
        // Check if we already pinged this user recently
        const lastPing = await redis.get<number>(lastKeepaliveKey(uid));
        if (lastPing && Date.now() / 1000 - lastPing < KEEPALIVE_INTERVAL_SECONDS) {
          return { uid, skipped: true };
        }
        await keepAlive(uid);
        await redis.set(lastKeepaliveKey(uid), Math.floor(Date.now() / 1000), {
          ex: KEEPALIVE_INTERVAL_SECONDS + 60 * 60 * 24, // 21 days
        });
        return { uid, pinged: true };
      })
    );

    return NextResponse.json({
      ok: true,
      processed: userIds.length,
      results: results.map((r) =>
        r.status === "fulfilled" ? r.value : { error: String(r.reason) }
      ),
    });
  }

  if (!parsed.userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  // Single user keep-alive
  if (redis) {
    const lastPing = await redis.get<number>(lastKeepaliveKey(parsed.userId));
    if (lastPing && Date.now() / 1000 - lastPing < KEEPALIVE_INTERVAL_SECONDS) {
      return NextResponse.json({ ok: true, skipped: true, reason: "Pinged recently" });
    }
  }

  await keepAlive(parsed.userId);

  if (redis) {
    await redis.set(
      lastKeepaliveKey(parsed.userId),
      Math.floor(Date.now() / 1000),
      { ex: KEEPALIVE_INTERVAL_SECONDS + 60 * 60 * 24 }
    );
  }

  return NextResponse.json({ ok: true, userId: parsed.userId });
}