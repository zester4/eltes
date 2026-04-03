// app/(chat)/api/subagents/chat/route.ts
// Coordinator route for subagent chat.
// POST: Accepts a message, saves to Redis, triggers Upstash Workflow for durable execution.
// GET:  Polls task status + latest messages for the frontend.

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { guestRegex } from "@/lib/constants";
import { getSubAgentBySlug } from "@/lib/agent/subagent-definitions";
import { ChatbotError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";
import {
  getSubagentChatMessages,
  saveSubagentChatMessages,
} from "@/lib/subagent-redis";
import {
  createAgentTask,
  getAgentTaskById,
  updateAgentTask,
} from "@/lib/db/queries";
import {
  isWorkflowEnabled,
  triggerSubagentChatWorkflow,
} from "@/lib/workflow/client";
import type { ChatMessage } from "@/lib/types";

export const maxDuration = 60;

// ── POST: Send a message ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();

    // Support both singular 'message' and plural 'messages'
    let messages = (json as any).messages as ChatMessage[];
    if (!messages && (json as any).message) {
      messages = [(json as any).message];
    }

    const { agentSlug, chatId } = json as {
      agentSlug: string;
      chatId?: string;
    };

    if (!agentSlug || !messages || !Array.isArray(messages)) {
      return new ChatbotError("bad_request:api").toResponse();
    }

    const session = await auth();
    if (!session?.user?.id) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const isGuest = guestRegex.test(session.user.email ?? "");
    if (isGuest) {
      return new ChatbotError(
        "forbidden:chat",
        "Guests cannot use subagents directly.",
      ).toResponse();
    }

    const definition = getSubAgentBySlug(agentSlug);
    if (!definition) {
      return new ChatbotError(
        "bad_request:api",
        `Unknown subagent slug: ${agentSlug}`,
      ).toResponse();
    }

    // Save the full message array (including the new user message) to Redis
    await saveSubagentChatMessages(session.user.id, agentSlug, messages);

    // Create a task in the DB to track this execution
    const taskId = generateUUID();
    await createAgentTask({
      id: taskId,
      userId: session.user.id,
      chatId: chatId || `subagent-${agentSlug}`,
      agentType: agentSlug,
      task: extractLastUserText(messages),
    });

    // Trigger durable execution via Upstash Workflow
    if (isWorkflowEnabled()) {
      try {
        const workflowResult = await triggerSubagentChatWorkflow({
          taskId,
          userId: session.user.id,
          agentSlug,
          chatId,
        });
        if (workflowResult?.workflowRunId) {
          try {
            await updateAgentTask({
              id: taskId,
              userId: session.user.id,
              workflowRunId: workflowResult.workflowRunId,
            });
          } catch {
            // workflowRunId column may not exist — workflow still runs
          }
          return NextResponse.json({
            taskId,
            status: "submitted",
            mode: "workflow",
          });
        }
      } catch (err) {
        console.error(
          "[Subagent Chat] Workflow trigger failed, falling back to inline:",
          err,
        );
      }
    }

    // Fallback: run inline (for local dev or workflow unavailability)
    await runInlineSubagentChat({
      taskId,
      userId: session.user.id,
      agentSlug,
      chatId,
    });

    return NextResponse.json({
      taskId,
      status: "submitted",
      mode: "inline",
    });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    console.error("Unhandled error in subagents chat API:", error);
    return new ChatbotError("offline:chat").toResponse();
  }
}

// ── GET: Poll for status + messages ───────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const agentSlug = request.nextUrl.searchParams.get("agentSlug");
    const taskId = request.nextUrl.searchParams.get("taskId");

    if (!agentSlug) {
      return new ChatbotError("bad_request:api").toResponse();
    }

    const messages = await getSubagentChatMessages(session.user.id, agentSlug);

    let taskStatus: string | null = null;
    if (taskId) {
      try {
        const task = await getAgentTaskById({
          id: taskId,
          userId: session.user.id,
        });
        taskStatus = task?.status ?? null;
      } catch {
        // task may not exist yet
      }
    }

    return NextResponse.json({
      messages,
      taskStatus,
    });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    console.error("Unhandled error in subagents chat GET:", error);
    return new ChatbotError("offline:chat").toResponse();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractLastUserText(messages: ChatMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser?.parts) return "";
  return lastUser.parts
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join(" ");
}

/**
 * Inline fallback: runs the subagent chat synchronously (without Upstash Workflow).
 * Used in local dev or when workflow trigger fails.
 */
async function runInlineSubagentChat(params: {
  taskId: string;
  userId: string;
  agentSlug: string;
  chatId?: string;
}) {
  const { taskId, userId, agentSlug, chatId } = params;

  // Run in background — don't block the response
  (async () => {
    try {
      const { generateText, stepCountIs, convertToModelMessages } = await import("ai");
      const { Composio } = await import("@composio/core");
      const { VercelProvider } = await import("@composio/vercel");
      const { getSubAgentBySlug } = await import(
        "@/lib/agent/subagent-definitions"
      );
      const { DEFAULT_CHAT_MODEL } = await import("@/lib/ai/models");
      const { getGoogleModel, getLanguageModel } = await import(
        "@/lib/ai/providers"
      );
      const memTools = await import("@/lib/ai/tools/memory");
      const schedTools = await import("@/lib/ai/tools/schedule");

      const definition = getSubAgentBySlug(agentSlug);
      if (!definition) {
        await updateAgentTask({
          id: taskId,
          userId,
          status: "failed",
          result: { error: `Unknown agent slug: ${agentSlug}` },
        });
        return;
      }

      await updateAgentTask({ id: taskId, userId, status: "running" });

      const messages = await getSubagentChatMessages(userId, agentSlug);

      const baseUrl =
        process.env.BASE_URL ||
        (process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : undefined) ||
        (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000");

      let composioTools: Record<string, any> = {};
      try {
        const composio = new Composio({ provider: new VercelProvider() });
        const session = await composio.create(userId, {
          manageConnections: true,
        });
        composioTools = await session.tools();
      } catch {
        /* optional */
      }

      const tools = {
        ...composioTools,
        saveMemory: memTools.saveMemory({ userId }),
        recallMemory: memTools.recallMemory({ userId }),
        updateMemory: memTools.updateMemory({ userId }),
        deleteMemory: memTools.deleteMemory({ userId }),
        setReminder: schedTools.setReminder({ userId, baseUrl }),
        setCronJob: schedTools.setCronJob({ userId, baseUrl }),
        listSchedules: schedTools.listSchedules({ userId }),
        deleteSchedule: schedTools.deleteSchedule(),
      };

      const subagentModel =
        process.env.SUBAGENT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
      const model = subagentModel.startsWith("google/")
        ? getGoogleModel(subagentModel)
        : getLanguageModel(subagentModel);

      const modelMessages = await convertToModelMessages(messages as any);

      const genResult = await generateText({
        model,
        system: `${definition.systemPrompt}\n\nToday's date is ${new Date().toLocaleDateString()}. Execute the task now. Summarize what you did.`,
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(25),
      });

      const assistantMessage: ChatMessage = {
        id: generateUUID(),
        role: "assistant",
        parts: [
          ...(genResult.text
            ? [{ type: "text" as const, text: genResult.text }]
            : []),
        ],
      } as any;

      await saveSubagentChatMessages(userId, agentSlug, [
        ...messages,
        assistantMessage,
      ]);

      await updateAgentTask({
        id: taskId,
        userId,
        status: "completed",
        result: { text: genResult.text },
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error("[Subagent Chat Inline] Error:", errMsg);

      await updateAgentTask({
        id: taskId,
        userId,
        status: "failed",
        result: { error: errMsg },
      });

      // Save error to Redis so the user sees it
      const messages = await getSubagentChatMessages(userId, agentSlug);
      const errorMessage: ChatMessage = {
        id: generateUUID(),
        role: "assistant",
        parts: [
          {
            type: "text" as const,
            text: `⚠️ An error occurred: ${errMsg}`,
          },
        ],
      } as any;
      await saveSubagentChatMessages(userId, agentSlug, [
        ...messages,
        errorMessage,
      ]);
    }
  })();
}
