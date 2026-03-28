import { auth } from "@/app/(auth)/auth";
import { type PendingApproval, approvalKey } from "@/app/api/telegram/callback/route-utils";
import { saveMessages } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const composio = new Composio({ provider: new VercelProvider() });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { draftId, action, editPrompt } = await request.json();

  if (!redis) {
    return NextResponse.json({ error: "Storage unavailable" }, { status: 500 });
  }

  const raw = await redis.get<string | PendingApproval>(approvalKey(draftId));
  if (!raw) {
    return NextResponse.json({ error: "Draft not found or expired" }, { status: 404 });
  }

  const approval: PendingApproval = typeof raw === "string" ? JSON.parse(raw) : (raw as PendingApproval);

  // Security check: ensure the draft belongs to the requesting user
  // (In queue-approval.ts, we store the chatId, which is tied to the user)
  // For now, we trust the draftId is unique and hard to guess, but we could add more checks.

  if (action === "approve") {
    try {
      const composioSession = await composio.create(session.user.id, { manageConnections: true });
      const tools = await composioSession.tools();
      const tool = (tools as any)[approval.executionTool];

      let result = "Done.";
      if (tool?.execute) {
        const execResult = await tool.execute(approval.executionInput, {} as any);
        result = typeof execResult === "string"
          ? execResult
          : JSON.stringify(execResult).slice(0, 1000);
      }

      // Save execution result to chat history
      await saveMessages({
        messages: [{
          id: generateUUID(),
          chatId: approval.chatId,
          role: "assistant",
          parts: [{ type: "text", text: `✅ Executed: ${approval.summary}\n\nResult: ${result}` }],
          attachments: [],
          createdAt: new Date(),
        }] as any,
      });

      await redis.del(approvalKey(draftId));
      return NextResponse.json({ success: true, result });
    } catch (error: any) {
      console.error("[Approval API] Execution failed:", error);
      return NextResponse.json({ error: error.message || "Execution failed" }, { status: 500 });
    }
  }

  if (action === "reject") {
    await saveMessages({
      messages: [{
        id: generateUUID(),
        chatId: approval.chatId,
        role: "assistant",
        parts: [{ type: "text", text: `Action rejected: ${approval.summary}` }],
        attachments: [],
        createdAt: new Date(),
      }] as any,
    });

    await redis.del(approvalKey(draftId));
    return NextResponse.json({ success: true });
  }

  if (action === "edit") {
     // For "edit", we just save the message to chat and let the agent handle it
     // But we need to keep the draft in Redis so the agent can reference it or replace it
     await saveMessages({
      messages:[
        {
          id: generateUUID(),
          chatId: approval.chatId,
          role: "user",
          parts: [{ type: "text", text: `[EDIT REQUEST for ${draftId}] ${editPrompt}` }],
          attachments: [],
          createdAt: new Date(),
        }
      ] as any
     })

     // We don't delete the draft yet, as the agent might want to resubmit it.
     // But maybe we should delete it to avoid stale approvals.
     // For now, let's keep it until specifically replaced or rejected.
     return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
