// app/(chat)/api/agent/trigger-worker/route.ts
//
// QStash-verified worker that executes a single trigger-dispatched sub-agent.
// The webhook handler publishes queued routes here instead of using fire-and-forget.
//
// QStash guarantees: at-least-once delivery, automatic retries, no timeout pressure.

import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { generateText, stepCountIs } from "ai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { getLanguageModel } from "@/lib/ai/providers";
import { getSubAgentBySlug } from "@/lib/agent/subagent-definitions";
import { Index } from "@upstash/vector";
import {
  createAgentTask,
  getChatsByUserId,
  saveMessages,
  updateAgentTask,
} from "@/lib/db/queries";
import { getWeather } from "@/lib/ai/tools/get-weather";
import {
  saveMemory,
  recallMemory,
  updateMemory,
  deleteMemory,
} from "@/lib/ai/tools/memory";
import { generateUUID } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TriggerWorkerPayload {
  userId: string;
  chatId: string;
  agentSlug: string;
  taskPrompt: string;
  triggerName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Memory injection — recall relevant context before agent runs
// ─────────────────────────────────────────────────────────────────────────────

async function recallRelevantMemory(userId: string, query: string): Promise<string> {
  try {
    const index = new Index({
      url: process.env.UPSTASH_VECTOR_REST_URL!,
      token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
    });
    const ns = index.namespace(`memory-${userId}`);
    const results = await ns.query({
      data: query,
      topK: 5,
      includeMetadata: true,
    });

    if (!results.length) return "";

    const lines = results.map((r) => {
      const meta = r.metadata as any;
      return `• [${meta?.key ?? "memory"}]: ${meta?.content ?? ""}`;
    });

    return `\n\n═══════════════════════════════════════════\nUSER MEMORY (relevant context recalled)\n═══════════════════════════════════════════\n${lines.join("\n")}`;
  } catch {
    return ""; // Memory recall is non-fatal
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt builder
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(
  agentSystemPrompt: string,
  triggerName: string,
  memoryContext: string
): string {
  return `${agentSystemPrompt}${memoryContext}

═══════════════════════════════════════════
EXECUTION CONTEXT
═══════════════════════════════════════════
• Mode: AUTONOMOUS — triggered by live integration event, not a user message.
• Trigger: ${triggerName}
• Current date/time: ${new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}
• The user is not present. They will read your output later.

PRIME DIRECTIVE:
Do not ask clarifying questions. Do not defer. Execute completely based on your role.
Use your tools. Take action. Leave the user a concise, confident summary of exactly what was done.
If an action requires explicit user approval per your role instructions, draft it clearly and flag it — do not execute it.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persist messages to chat (trigger event + agent response + tool calls)
// ─────────────────────────────────────────────────────────────────────────────

async function persistToChat(
  chatId: string,
  triggerName: string,
  taskPrompt: string,
  result: any
): Promise<void> {
  const messagesToSave: any[] = [];
  const timestamp = new Date();

  // The trigger event shown as a user message in the chat timeline
  messagesToSave.push({
    id: generateUUID(),
    chatId,
    role: "user",
    parts: [{ type: "text", text: `[Trigger: ${triggerName}]\n\n${taskPrompt}` }],
    attachments: [],
    createdAt: timestamp,
  });

  // Agent's final text response
  if (result.text) {
    messagesToSave.push({
      id: generateUUID(),
      chatId,
      role: "assistant",
      parts: [{ type: "text", text: result.text }],
      attachments: [],
      createdAt: new Date(timestamp.getTime() + 1_000),
    });
  }

  // Tool calls and results interleaved
  if (result.steps) {
    let offset = 2_000;
    for (const step of result.steps) {
      if (!step.toolCalls?.length) continue;
      for (const call of step.toolCalls) {
        const toolCallId = call.toolCallId;

        messagesToSave.push({
          id: generateUUID(),
          chatId,
          role: "assistant",
          parts: [{
            type: "tool-call",
            toolCallId,
            toolName: (call as any).toolName,
            args: (call as any).args,
          }],
          attachments: [],
          createdAt: new Date(timestamp.getTime() + offset),
        });

        const toolResult = step.toolResults?.find((r: any) => r.toolCallId === toolCallId);
        if (toolResult) {
          messagesToSave.push({
            id: generateUUID(),
            chatId,
            role: "tool",
            parts: [{
              type: "tool-result",
              toolCallId,
              toolName: (call as any).toolName,
              result: (toolResult as any).result,
            }],
            attachments: [],
            createdAt: new Date(timestamp.getTime() + offset + 500),
          });
        }

        offset += 1_000;
      }
    }
  }

  await saveMessages({ messages: messagesToSave });
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

async function handler(req: NextRequest): Promise<NextResponse> {
  let body: TriggerWorkerPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, chatId, agentSlug, taskPrompt, triggerName } = body;

  if (!userId || !chatId || !agentSlug || !taskPrompt || !triggerName) {
    return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  const agent = getSubAgentBySlug(agentSlug);
  if (!agent) {
    return NextResponse.json({ ok: false, error: `Unknown agent: ${agentSlug}` }, { status: 400 });
  }

  console.log(`[TriggerWorker] Running "${agentSlug}" for trigger "${triggerName}" | user: ${userId}`);

  // 1. Recall relevant user memory
  const memoryContext = await recallRelevantMemory(userId, taskPrompt);

  // 2. Load Composio tools scoped to this agent's declared toolkits
  let composioTools: Record<string, any> = {};
  try {
    const composio = new Composio({ provider: new VercelProvider() });
    const session = await composio.create(userId);
    composioTools = await session.tools();
  } catch (e) {
    console.error(`[TriggerWorker] Composio tools failed for "${agentSlug}":`, e);
  }

  const tools = {
    ...composioTools,
    getWeather,
    saveMemory: saveMemory({ userId }),
    recallMemory: recallMemory({ userId }),
    updateMemory: updateMemory({ userId }),
    deleteMemory: deleteMemory({ userId }),
  };

  // 3. Run the agent
  const taskId = generateUUID();
  await createAgentTask({
    id: taskId,
    userId,
    chatId,
    agentType: agentSlug,
    task: `[Trigger: ${triggerName}] ${taskPrompt}`,
  });

  await updateAgentTask({
    id: taskId,
    userId,
    status: "running",
  });

  const result = await generateText({
    model: getLanguageModel("google/gemini-3-flash"),
    system: buildSystemPrompt(agent.systemPrompt, triggerName, memoryContext),
    prompt: taskPrompt,
    tools,
    stopWhen: stepCountIs(25),
  });

  const resultPayload = {
    text: result.text,
    toolCalls: result.steps?.flatMap((s) => s.toolCalls ?? []),
  };

  await updateAgentTask({
    id: taskId,
    userId,
    status: "completed",
    result: resultPayload,
  });

  // 4. Persist interaction to the user's active chat
  await persistToChat(chatId, triggerName, taskPrompt, result);

  console.log(
    `[TriggerWorker] "${agentSlug}" done — ` +
    `tools used: ${result.toolCalls?.length ?? 0}, ` +
    `response: ${result.text?.length ?? 0} chars`
  );

  return NextResponse.json({
    ok: true,
    agentSlug,
    triggerName,
    toolsUsed: result.toolCalls?.length ?? 0,
    responseLength: result.text?.length ?? 0,
  });
}

// QStash signature verification wraps the handler
export const POST = verifySignatureAppRouter(handler);
