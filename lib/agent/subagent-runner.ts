/**
 * Runs a sub-agent with Composio tools. Mirrors the chat route pattern.
 */

import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { generateText, stepCountIs } from "ai";
import { getSubAgentBySlug } from "@/lib/agent/subagent-definitions";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getLanguageModel } from "@/lib/ai/providers";
import { getWeather } from "@/lib/ai/tools/get-weather";
import {
  deleteMemory,
  recallMemory,
  saveMemory,
  updateMemory,
} from "@/lib/ai/tools/memory";
import { notifySubAgentHandoffToMainAgent } from "@/lib/agent/subagent-handoff-notify";
import type { DBMessage } from "@/lib/db/schema";
import { saveMessages, updateAgentTask } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";

const composio = new Composio({ provider: new VercelProvider() });

export interface RunSubAgentParams {
  taskId: string;
  userId: string;
  chatId: string;
  agentType: string;
  task: string;
}

export async function runSubAgent(params: RunSubAgentParams): Promise<{
  success: boolean;
  text?: string;
  error?: string;
}> {
  const { taskId, userId, chatId, agentType, task } = params;

  const definition = getSubAgentBySlug(agentType);
  if (!definition) {
    await updateAgentTask({
      id: taskId,
      userId,
      status: "failed",
      result: { error: `Unknown agent type: ${agentType}` },
    });
    return { success: false, error: `Unknown agent type: ${agentType}` };
  }

  await updateAgentTask({
    id: taskId,
    userId,
    status: "running",
  });

  let composioTools: Record<string, unknown> = {};
  try {
    const session = await composio.create(userId, { manageConnections: true });
    composioTools = await session.tools();
  } catch {
    /* Composio optional — agent still runs with built-in tools */
  }

  const tools = {
    ...composioTools,
    getWeather,
    saveMemory: saveMemory({ userId }),
    recallMemory: recallMemory({ userId }),
    updateMemory: updateMemory({ userId }),
    deleteMemory: deleteMemory({ userId }),
  };

  const systemPrompt = `${definition.systemPrompt}

Today's date is ${new Date().toLocaleDateString()}.
Execute the task now. Summarize what you did in your final response.`;

  const subagentModel =
    process.env.SUBAGENT_MODEL?.trim() || DEFAULT_CHAT_MODEL;

  try {
    const result = await generateText({
      model: getLanguageModel(subagentModel),
      system: systemPrompt,
      prompt: `Task: ${task}`,
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

    const timestamp = new Date();
    const messagesToSave: DBMessage[] = [];

    const agentPayload = {
      agentType: definition.name,
      slug: agentType,
      task,
      taskId,
      result: result.text,
      timestamp: timestamp.toISOString(),
    };

    messagesToSave.push({
      id: generateUUID(),
      chatId,
      role: "assistant",
      parts: [
        {
          type: "text",
          text: `###AGENT_RESULT###${JSON.stringify(agentPayload)}`,
        },
      ],
      attachments: [],
      createdAt: new Date(timestamp.getTime() + 1000),
    });

    await saveMessages({ messages: messagesToSave });

    notifySubAgentHandoffToMainAgent({
      chatId,
      userId,
      taskId,
      agentName: definition.name,
      slug: agentType,
      task,
      outcome: "completed",
      summary: result.text || JSON.stringify(resultPayload),
    });

    return { success: true, text: result.text };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await updateAgentTask({
      id: taskId,
      userId,
      status: "failed",
      result: { error: errMsg },
    });

    const failPayload = {
      agentType: definition.name,
      slug: agentType,
      task,
      taskId,
      error: errMsg,
      timestamp: new Date().toISOString(),
    };
    const messagesToSave: DBMessage[] = [
      {
        id: generateUUID(),
        chatId,
        role: "assistant",
        parts: [
          {
            type: "text",
            text: `###AGENT_RESULT###${JSON.stringify(failPayload)}`,
          },
        ],
        attachments: [],
        createdAt: new Date(),
      },
    ];
    await saveMessages({ messages: messagesToSave });

    notifySubAgentHandoffToMainAgent({
      chatId,
      userId,
      taskId,
      agentName: definition.name,
      slug: agentType,
      task,
      outcome: "failed",
      summary: errMsg,
    });

    return { success: false, error: errMsg };
  }
}
