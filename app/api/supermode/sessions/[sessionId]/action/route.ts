/**
 * SuperMode Activity Feed — Polling Endpoint
 * Route: GET /api/supermode/sessions/[sessionId]/action
 *
 * Returns all actions for a session, optionally filtered to only those after
 * a given action ID (for efficient incremental polling by the UI).
 *
 * The UI polls this every 2-3 seconds while a session is active.
 *
 * File location: app/api/supermode/sessions/[sessionId]/action/route.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getSupermodeActions, getSupermodeSessionById } from "@/lib/db/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;

  try {
    // Verify the session belongs to this user
    const supermodeSession = await getSupermodeSessionById(sessionId);
    if (!supermodeSession || supermodeSession.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const afterId = searchParams.get("afterId") ?? undefined;
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(searchParams.get("limit") ?? "50", 10)),
    );

    const actions = await getSupermodeActions(sessionId, limit, afterId);

    return NextResponse.json({
      actions,
      session: {
        id: supermodeSession.id,
        status: supermodeSession.status,
        currentStep: supermodeSession.currentStep,
        maxSteps: supermodeSession.maxSteps,
        objective: supermodeSession.objective,
        createdAt: supermodeSession.createdAt,
        completedAt: supermodeSession.completedAt,
      },
    });
  } catch (error) {
    console.error("[SuperMode Actions] GET failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}