// app/api/subagents/chat/workflow/failure/route.ts
// Called by Upstash Workflow when all retries are exhausted.

import { NextRequest, NextResponse } from "next/server";
import { updateAgentTask } from "@/lib/db/queries";
import {
  getSubagentChatMessages,
  saveSubagentChatMessages,
} from "@/lib/subagent-redis";
import { generateUUID } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId, userId, agentSlug, error } = body as {
      taskId?: string;
      userId?: string;
      agentSlug?: string;
      error?: string;
    };

    if (taskId && userId) {
      await updateAgentTask({
        id: taskId,
        userId,
        status: "failed",
        result: { error: error ?? "Workflow failed after all retries" },
      });
    }

    // Save error message to Redis chat so the user sees the failure
    if (userId && agentSlug) {
      const messages = await getSubagentChatMessages(userId, agentSlug);
      const errorMessage: ChatMessage = {
        id: generateUUID(),
        role: "assistant",
        parts: [
          {
            type: "text" as const,
            text: `⚠️ The agent encountered an error and could not complete the task: ${error ?? "Unknown error"}. Please try again.`,
          },
        ],
      } as any;
      await saveSubagentChatMessages(userId, agentSlug, [
        ...messages,
        errorMessage,
      ]);
    }
  } catch (e) {
    console.error("[Subagent Chat Workflow Failure] Handler error:", e);
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
