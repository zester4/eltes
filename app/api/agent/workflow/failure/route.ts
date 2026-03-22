import { NextRequest, NextResponse } from "next/server";
import { updateAgentTask } from "@/lib/db/queries";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId, userId, error } = body as {
      taskId?: string;
      userId?: string;
      error?: string;
    };
    if (taskId && userId) {
      await updateAgentTask({
        id: taskId,
        userId,
        status: "failed",
        result: { error: error ?? "Workflow failed" },
      });
    }
  } catch (e) {
    console.error("[Workflow Failure] Handler error:", e);
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
