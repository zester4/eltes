/**
 * SuperMode Sessions API
 * Route: GET /api/supermode/sessions — list or active session
 * Route: POST /api/supermode/sessions — start SuperMode (auth + QStash trigger)
 *
 * File location: app/api/supermode/sessions/route.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  getActiveSupermodeSessionByUserId,
  getChatById,
  getSupermodeSessionsByUserId,
  saveChat,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { startSupermodeSession } from "@/lib/supermode/start-session";

const startBodySchema = z.object({
  chatId: z.string().uuid(),
  objective: z.string().min(20).max(20000),
  maxSteps: z.number().int().min(5).max(50).optional().default(25),
  visibility: z.enum(["private", "public"]).optional().default("private"),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "unauthorized", message: "You must be signed in to start SuperMode." },
        { status: 401 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "invalid_json", message: "Request body must be JSON." },
        { status: 400 },
      );
    }

    const parsed = startBodySchema.safeParse(body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const firstField =
        Object.values(flat.fieldErrors).flat().find((m) => typeof m === "string") ??
        flat.formErrors.at(0);
      return NextResponse.json(
        {
          error: "invalid_request",
          message:
            typeof firstField === "string"
              ? firstField
              : "Invalid objective, chat id, or options.",
          details: flat,
        },
        { status: 400 },
      );
    }

    const { chatId, objective, maxSteps, visibility } = parsed.data;
    const chatRow = await getChatById({ id: chatId });

    if (chatRow) {
      if (chatRow.userId !== session.user.id) {
        return NextResponse.json(
          { error: "forbidden", message: "You do not have access to this chat." },
          { status: 403 },
        );
      }
    } else {
      // New chat page uses a client UUID before any message is saved — mirror
      // app/(chat)/api/chat/route.ts so SuperMode can start on the first send.
      const trimmed = objective.trim();
      const title =
        trimmed.length <= 100 ? trimmed : `${trimmed.slice(0, 97)}…`;
      await saveChat({
        id: chatId,
        userId: session.user.id,
        title,
        visibility,
      });
    }

    const result = await startSupermodeSession({
      userId: session.user.id,
      chatId,
      objective,
      maxSteps,
    });

    if (!result.ok) {
      if (result.code === "already_active") {
        return NextResponse.json(
          {
            error: "already_active",
            message: result.message,
            existingSessionId: result.existingSessionId,
          },
          { status: 409 },
        );
      }
      if (result.code === "workflow_disabled") {
        return NextResponse.json(
          { error: result.code, message: result.message },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: result.code, message: result.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      sessionId: result.sessionId,
      workflowRunId: result.workflowRunId,
    });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return NextResponse.json(
        {
          error: "server_error",
          message: error.message,
          cause: typeof error.cause === "string" ? error.cause : undefined,
        },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      {
        error: "internal_error",
        message:
          error instanceof Error ? error.message : "Unexpected error starting SuperMode.",
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") === "1";

  try {
    if (activeOnly) {
      const active = await getActiveSupermodeSessionByUserId(session.user.id);
      return NextResponse.json({ session: active ?? null });
    }

    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(searchParams.get("limit") ?? "10", 10)),
    );
    const sessions = await getSupermodeSessionsByUserId(session.user.id, limit);
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("[SuperMode Sessions] GET failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}