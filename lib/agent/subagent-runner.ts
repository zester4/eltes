
/**
 * Runs a sub-agent with Composio tools. Mirrors the chat route pattern.
 * lib/agent/subagent-runner.ts is called by the main agent when delegating a task to a sub-agent.
 */

import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { generateText, stepCountIs } from "ai";
import { getSubAgentBySlug } from "@/lib/agent/subagent-definitions";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getGoogleModel, getLanguageModel } from "@/lib/ai/providers";
import { generateImageTool } from "@/lib/ai/tools/generate-image";
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
import { Index } from "@upstash/vector";
import { launchMission, getMissionStatus } from "@/lib/ai/tools/missions";
import {
  setReminder,
  setCronJob,
  listSchedules,
  deleteSchedule,
} from "@/lib/ai/tools/schedule";
import * as daytonaTools from "@/lib/ai/tools/daytona";
import * as browserUseTools from "@/lib/ai/tools/browser-use";
import * as daytonaBrowserTools from "@/lib/ai/tools/daytona-browser";

const composio = new Composio({ provider: new VercelProvider() });

async function recallRelevantMemory(userId: string, query: string): Promise<string> {
  try {
    const index = new Index({
      url: process.env.UPSTASH_VECTOR_REST_URL!,
      token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
    });
    const ns = index.namespace(`memory-${userId}`);
    const results = await ns.query({ data: query, topK: 5, includeMetadata: true });
    if (!results.length) return "";
    const lines = results.map((r) => {
      const meta = r.metadata as any;
      return `• [${meta?.key ?? "memory"}]: ${meta?.content ?? ""}`;
    });
    return `\n\n═══════════════════════════════════════════\nUSER MEMORY (relevant context recalled)\n═══════════════════════════════════════════\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

export interface RunSubAgentParams {
  taskId: string;
  userId: string;
  chatId?: string;
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

  const baseUrl =
    process.env.BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const tools = {
    ...composioTools,
    getWeather,
    generateImage: generateImageTool(),
    saveMemory: saveMemory({ userId }),
    recallMemory: recallMemory({ userId }),
    updateMemory: updateMemory({ userId }),
    deleteMemory: deleteMemory({ userId }),
    launchMission: launchMission({ userId, chatId, baseUrl }),
    getMissionStatus: getMissionStatus({ userId }),
    setReminder: setReminder({ userId, baseUrl }),
    setCronJob: setCronJob({ userId, baseUrl }),
    listSchedules: listSchedules({ userId }),
    deleteSchedule: deleteSchedule(),

    // Daytona Sandbox Tools (Sandbox Specialist + Browser Operator for Playwright sessions)
    ...(agentType === "sandbox_specialist" || agentType === "browser_operator"
      ? {
          createSandbox: daytonaTools.createSandbox({ userId }),
          listSandboxes: daytonaTools.listSandboxes({ userId }),
          deleteSandbox: daytonaTools.deleteSandbox({ userId }),
          executeCommand: daytonaTools.executeCommand({ userId }),
          runCode: daytonaTools.runCode({ userId }),
          listFiles: daytonaTools.listFiles({ userId }),
          readFile: daytonaTools.readFile({ userId }),
          writeFile: daytonaTools.writeFile({ userId }),
          createDirectory: daytonaTools.createDirectory({ userId }),
          searchFiles: daytonaTools.searchFiles({ userId }),
          replaceInFiles: daytonaTools.replaceInFiles({ userId }),
          gitClone: daytonaTools.gitClone({ userId }),
          gitStatus: daytonaTools.gitStatus({ userId }),
          gitCommit: daytonaTools.gitCommit({ userId }),
          gitPush: daytonaTools.gitPush({ userId }),
          gitPull: daytonaTools.gitPull({ userId }),
          gitBranch: daytonaTools.gitBranch({ userId }),
          getPreviewLink: daytonaTools.getPreviewLink({ userId }),
          runBackgroundProcess: daytonaTools.runBackgroundProcess({ userId }),
          lspDiagnostics: daytonaTools.lspDiagnostics({ userId }),
          archiveSandbox: daytonaTools.archiveSandbox({ userId }),
        }
      : {}),

    // Browser Use Cloud + Daytona Playwright (Browser Operator only)
    ...(agentType === "browser_operator"
      ? {
          browserUseRunTask: browserUseTools.browserUseRunTask(),
          browserUseStartTask: browserUseTools.browserUseStartTask(),
          browserUseGetTask: browserUseTools.browserUseGetTask(),
          browserUseControlTask: browserUseTools.browserUseControlTask(),
          browserUseCreateSession: browserUseTools.browserUseCreateSession(),
          browserUseGetLiveUrl: browserUseTools.browserUseGetLiveUrl(),
          browserUseListTasks: browserUseTools.browserUseListTasks(),
          browserUseCheckCredits: browserUseTools.browserUseCheckCredits(),
          browserSetup: daytonaBrowserTools.browserSetup({ userId }),
          browserNavigate: daytonaBrowserTools.browserNavigate({ userId }),
          browserInteract: daytonaBrowserTools.browserInteract({ userId }),
          browserExtract: daytonaBrowserTools.browserExtract({ userId }),
          browserMultiTab: daytonaBrowserTools.browserMultiTab({ userId }),
          browserUploadFile: daytonaBrowserTools.browserUploadFile({ userId }),
          browserScreenshot: daytonaBrowserTools.browserScreenshot({ userId }),
          browserVisualInteract: daytonaBrowserTools.browserVisualInteract({ userId }),
        }
      : {}),
  };

  const memoryContext = await recallRelevantMemory(userId, task);

  const ATTACHMENT_DELIMITER = "###ATTACHMENTS###";
  let promptTask = task;
  const parsedAttachments: string[] = [];

  if (task.includes(ATTACHMENT_DELIMITER)) {
    const parts = task.split(ATTACHMENT_DELIMITER);
    promptTask = parts[0].trim();
    try {
      const urls = JSON.parse(parts[1].trim());
      if (Array.isArray(urls)) parsedAttachments.push(...urls);
    } catch (e) {}
  }

  const systemPrompt = `${definition.systemPrompt}${memoryContext}

Today's date is ${new Date().toLocaleDateString()}.
Execute the task now. Summarize what you did in your final response.`;

  const subagentModel =
    process.env.SUBAGENT_MODEL?.trim() || DEFAULT_CHAT_MODEL;

  const model = subagentModel.startsWith("google/")
    ? getGoogleModel(subagentModel)
    : getLanguageModel(subagentModel);

  try {
    const userContent: any[] = [{ type: "text", text: `Task: ${promptTask}` }];
    for (const url of parsedAttachments) {
      if (typeof url === "string") {
        if (url.match(/\.(png|jpe?g|gif|webp|bmp)$/i)) {
          userContent.push({ type: "image", image: new URL(url) });
        } else {
          userContent.push({ type: "file", data: new URL(url), mimeType: "application/octet-stream" });
        }
      }
    }

    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
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

    if (chatId) {
      const timestamp = new Date();
      const messagesToSave: DBMessage[] = [];

      const agentPayload = {
        agentType: definition.name,
        slug: agentType,
        task: promptTask,
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
        task: promptTask,
        outcome: "completed",
        summary: result.text || JSON.stringify(resultPayload),
      });
    }

    return { success: true, text: result.text };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await updateAgentTask({
      id: taskId,
      userId,
      status: "failed",
      result: { error: errMsg },
    });

    if (chatId) {
      const failPayload = {
        agentType: definition.name,
        slug: agentType,
        task: promptTask,
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
        task: promptTask,
        outcome: "failed",
        summary: errMsg,
      });
    }

    return { success: false, error: errMsg };
  }
}
