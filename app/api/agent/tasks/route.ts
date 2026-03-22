import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  getActiveAgentTasksByUserId,
  getActiveAgentTasksByChatId,
  getRecentAgentTasksByUserId,
} from "@/lib/db/queries";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("chatId");
  const all = searchParams.get("all") === "1";
  const limit = Math.min(
    200,
    Math.max(1, Number.parseInt(searchParams.get("limit") ?? "80", 10)),
  );

  try {
    let tasks;
    if (all) {
      tasks = await getRecentAgentTasksByUserId(session.user.id, limit);
    } else if (chatId) {
      tasks = await getActiveAgentTasksByChatId(chatId, session.user.id);
    } else {
      tasks = await getActiveAgentTasksByUserId(session.user.id);
    }
    return NextResponse.json({ tasks });
  } catch (error: unknown) {
    console.error("[Agent Tasks] Failed to list:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
