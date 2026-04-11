/**
 * SuperMode Notify — Approval Gate Wake
 * Route: POST /api/supermode/sessions/notify
 *
 * Called by the Telegram callback handler when a user taps Approve or Reject
 * on a SuperMode approval message. Notifies the paused workflow via
 * notifyWorkflow() so context.waitForEvent() resolves.
 *
 * Also callable from the web UI for users who prefer to approve in-browser.
 *
 * File location: app/api/supermode/sessions/notify/route.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  getSupermodeSessionById,
  updateSupermodeSession,
  createSupermodeAction,
} from "@/lib/db/queries";
import { notifyWorkflow, cancelWorkflow } from "@/lib/workflow/client";

const INTERNAL_SECRET =
  process.env.AGENT_DELEGATE_SECRET ?? "dev-internal";

export async function POST(req: NextRequest) {
  // Accept both authenticated user requests (from UI) and internal
  // requests from the Telegram callback handler (via x-agent-secret).
  const internalSecret = req.headers.get("x-agent-secret");
  const isInternal = internalSecret === INTERNAL_SECRET;

  let userId: string | null = null;

  if (isInternal) {
    // Internal call from Telegram callback handler — userId in body
    // No auth session needed.
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = session.user.id;
  }

  let body: {
    sessionId: string;
    step: number;
    approved: boolean;
    userId?: string;
    action?: "cancel";
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { sessionId, step, approved, action } = body;
  const resolvedUserId = userId ?? body.userId ?? null;

  if (!sessionId || !resolvedUserId) {
    return NextResponse.json(
      { error: "Missing sessionId or userId" },
      { status: 400 },
    );
  }

  try {
    const session = await getSupermodeSessionById(sessionId);
    if (!session || session.userId !== resolvedUserId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // ── Cancel action: terminate the entire SuperMode run ─────────────────
    if (action === "cancel") {
      if (session.workflowRunId) {
        await cancelWorkflow(session.workflowRunId);
      }
      await updateSupermodeSession({
        id: sessionId,
        status: "cancelled",
        completedAt: new Date(),
        result: { achieved: false, summary: "Cancelled by user" },
      });
      return NextResponse.json({ ok: true, cancelled: true });
    }

    // ── Approval / rejection ──────────────────────────────────────────────
    if (typeof step !== "number") {
      return NextResponse.json({ error: "Missing step" }, { status: 400 });
    }

    // Notify the waiting workflow step
    await notifyWorkflow(
      `supermode-${sessionId}-step-${step}-approval`,
      { approved, step },
    );

    // Log the decision immediately (the workflow will also log it, but
    // this ensures it shows in the feed even if there's a small delay)
    await createSupermodeAction({
      sessionId,
      userId: resolvedUserId,
      stepIndex: step,
      actionType: approved ? "approved" : "rejected",
      summary: approved ? "Approved by user" : "Rejected by user",
      reasoning: null,
      toolName: null,
      toolInput: null,
      toolOutput: null,
      requiresApproval: false,
    });

    return NextResponse.json({ ok: true, approved });
  } catch (error) {
    console.error("[SuperMode Notify] Failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}