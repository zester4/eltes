/**
 * Heartbeat endpoint.
 * Route: POST /api/agent/heartbeat/route.ts
 *
 * Called by QStash on an hourly schedule (set up in onboarding).
 * Body: { userId: string }
 *
 * Validates the QStash signature then fires a durable Workflow so the
 * actual AI work doesn't run inline and can't time out.
 *
 * Also handles the weekly synthesis cron:
 * Body: { userId: string, type: "weekly_synthesis" }
 */

import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { triggerHeartbeatWorkflow, triggerWeeklySynthesisWorkflow } from "@/lib/workflow/client";

const receiver = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY ?? "",
    })
  : null;

export async function POST(req: NextRequest) {
  // Verify this came from QStash (skip in dev)
  if (receiver) {
    const body = await req.text();
    const signature = req.headers.get("upstash-signature") ?? "";
    const isValid = await receiver.verify({
      signature,
      body,
      clockTolerance: 5,
    }).catch(() => false);

    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let parsed: { userId?: string; type?: string };
    try {
      parsed = JSON.parse(body) as { userId?: string; type?: string };
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { userId, type } = parsed;
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    // Fire-and-forget — respond to QStash immediately to avoid delivery timeout.
    // The workflow itself is durable and will handle retries.
    if (type === "weekly_synthesis") {
      void triggerWeeklySynthesisWorkflow({ userId });
      return NextResponse.json({ ok: true, type: "weekly_synthesis" });
    }

    void triggerHeartbeatWorkflow({ userId });
    return NextResponse.json({ ok: true, type: "heartbeat" });
  }

  // Dev mode (no signing keys) — still require a basic secret
  const devSecret = req.headers.get("x-heartbeat-secret") || req.headers.get("x-agent-secret");
  if (devSecret !== (process.env.AGENT_DELEGATE_SECRET ?? "dev-internal")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { userId?: string; type?: string };
  try {
    body = await req.json() as { userId?: string; type?: string };
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { userId, type } = body;
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  if (type === "weekly_synthesis") {
    void triggerWeeklySynthesisWorkflow({ userId });
    return NextResponse.json({ ok: true, type: "weekly_synthesis" });
  }

  void triggerHeartbeatWorkflow({ userId });
  return NextResponse.json({ ok: true, type: "heartbeat" });
}
