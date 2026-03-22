import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  getAgentTaskById,
  getAgentTaskWorkflowRunId,
  updateAgentTask,
} from "@/lib/db/queries";
import { cancelWorkflow } from "@/lib/workflow/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;
  if (!taskId) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }

  try {
    const task = await getAgentTaskById({
      id: taskId,
      userId: session.user.id,
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (task.status !== "pending" && task.status !== "running") {
      return NextResponse.json(
        { error: "Task is not running" },
        { status: 400 },
      );
    }
    const workflowRunId = await getAgentTaskWorkflowRunId({
      id: taskId,
      userId: session.user.id,
    });
    if (workflowRunId) {
      await cancelWorkflow(workflowRunId);
    }
    await updateAgentTask({
      id: taskId,
      userId: session.user.id,
      status: "failed",
      result: { error: "Cancelled by user" },
    });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("[Agent Cancel] Failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
