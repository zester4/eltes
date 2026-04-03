import { type NextRequest, NextResponse } from "next/server";
import { runSubAgent } from "@/lib/agent/subagent-runner";
import { getAgentTaskByIdOnly } from "@/lib/db/queries";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-agent-secret");
  const expected = process.env.AGENT_DELEGATE_SECRET ?? "dev-internal";
  if (secret !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", message: "Invalid x-agent-secret" },
      { status: 401 }
    );
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Bad JSON body" },
        { status: 400 }
      );
    }
    const taskId =
      body &&
      typeof body === "object" &&
      "taskId" in body &&
      typeof (body as { taskId: unknown }).taskId === "string"
        ? (body as { taskId: string }).taskId
        : null;

    if (!taskId) {
      return NextResponse.json(
        { ok: false, error: "Missing taskId" },
        { status: 400 }
      );
    }

    const task = await getAgentTaskByIdOnly(taskId);

    if (!task) {
      return NextResponse.json(
        {
          ok: false,
          error: "Task not found",
          message:
            "No AgentTask row for this id. Run pnpm db:migrate or verify the task was created.",
          taskId,
        },
        { status: 404 }
      );
    }

    const result = await runSubAgent({
      taskId,
      userId: task.userId,
      chatId: task.chatId ?? undefined,
      agentType: task.agentType,
      task: task.task,
    });

    return NextResponse.json({
      ok: result.success,
      taskId,
      message: result.success ? "Agent completed" : result.error,
      error: result.error,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
