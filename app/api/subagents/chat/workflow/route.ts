// app/api/subagents/chat/workflow/route.ts
// Durable subagent chat execution via Upstash Workflow.
// Mirrors app/api/agent/workflow/route.ts but tailored for interactive chat sessions.

import { serve } from "@upstash/workflow/nextjs";
import { generateText, stepCountIs } from "ai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { getSubAgentBySlug } from "@/lib/agent/subagent-definitions";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getGoogleModel, getLanguageModel } from "@/lib/ai/providers";
import {
  saveMemory,
  recallMemory,
  updateMemory,
  deleteMemory,
} from "@/lib/ai/tools/memory";
import {
  setReminder,
  setCronJob,
  listSchedules,
  deleteSchedule,
} from "@/lib/ai/tools/schedule";
import * as daytonaTools from "@/lib/ai/tools/daytona";
import * as browserUseTools from "@/lib/ai/tools/browser-use";
import * as daytonaBrowserTools from "@/lib/ai/tools/daytona-browser";
import * as twilio from "@/lib/ai/tools/twilio";
import * as twilioWhatsApp from "@/lib/ai/tools/twilio-whatsapp";
import { updateAgentTask, saveMessages } from "@/lib/db/queries";
import {
  getSubagentChatMessages,
  saveSubagentChatMessages,
} from "@/lib/subagent-redis";
import { generateUUID } from "@/lib/utils";
import { Index } from "@upstash/vector";
import type { SubagentChatWorkflowPayload } from "@/lib/workflow/client";
import type { ChatMessage } from "@/lib/types";

export const maxDuration = 300;

const composio = new Composio({ provider: new VercelProvider() });

async function recallRelevantMemory(
  userId: string,
  query: string,
): Promise<string> {
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
    return "";
  }
}

function buildTools(userId: string, agentSlug: string, baseUrl: string) {
  return {
    saveMemory: saveMemory({ userId }),
    recallMemory: recallMemory({ userId }),
    updateMemory: updateMemory({ userId }),
    deleteMemory: deleteMemory({ userId }),
    setReminder: setReminder({ userId, baseUrl }),
    setCronJob: setCronJob({ userId, baseUrl }),
    listSchedules: listSchedules({ userId }),
    deleteSchedule: deleteSchedule(),

    // Daytona Sandbox Tools (Sandbox Specialist + Browser Operator)
    ...(agentSlug === "sandbox_specialist" || agentSlug === "browser_operator"
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
    ...(agentSlug === "browser_operator"
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
          browserVisualInteract: daytonaBrowserTools.browserVisualInteract({
            userId,
          }),
        }
      : {}),
    // Twilio Voice & SMS
    twilioMakeCall: twilio.twilioMakeCall({ userId }),
    twilioGetCall: twilio.twilioGetCall({ userId }),
    twilioListCalls: twilio.twilioListCalls({ userId }),
    twilioModifyCall: twilio.twilioModifyCall({ userId }),
    twilioSendSMS: twilio.twilioSendSMS({ userId }),
    twilioGetMessage: twilio.twilioGetMessage({ userId }),
    twilioListMessages: twilio.twilioListMessages({ userId }),
    twilioListMyNumbers: twilio.twilioListMyNumbers({ userId }),
    twilioSearchAvailableNumbers: twilio.twilioSearchAvailableNumbers({ userId }),
    twilioProvisionNumber: twilio.twilioProvisionNumber({ userId }),
    twilioReleaseNumber: twilio.twilioReleaseNumber({ userId }),
    twilioUpdateNumber: twilio.twilioUpdateNumber({ userId }),

    // Twilio WhatsApp
    twilioWhatsAppSendMessage: twilioWhatsApp.twilioWhatsAppSendMessage({ userId }),
    twilioWhatsAppGetMessage: twilioWhatsApp.twilioWhatsAppGetMessage({ userId }),
    twilioWhatsAppListMessages: twilioWhatsApp.twilioWhatsAppListMessages({ userId }),
    twilioWhatsAppSendTemplate: twilioWhatsApp.twilioWhatsAppSendTemplate({ userId }),
    twilioWhatsAppCreateTemplate: twilioWhatsApp.twilioWhatsAppCreateTemplate({ userId }),
    twilioWhatsAppListTemplates: twilioWhatsApp.twilioWhatsAppListTemplates({ userId }),
    twilioWhatsAppGetTemplate: twilioWhatsApp.twilioWhatsAppGetTemplate({ userId }),
    twilioWhatsAppDeleteTemplate: twilioWhatsApp.twilioWhatsAppDeleteTemplate({ userId }),
    twilioWhatsAppSubmitApproval: twilioWhatsApp.twilioWhatsAppSubmitApproval({ userId }),
    twilioWhatsAppGetApprovalStatus: twilioWhatsApp.twilioWhatsAppGetApprovalStatus({ userId }),
    twilioWhatsAppListSenders: twilioWhatsApp.twilioWhatsAppListSenders({ userId }),
    twilioWhatsAppMarkMessageRead: twilioWhatsApp.twilioWhatsAppMarkMessageRead({ userId }),
  };
}

export const { POST } = serve<SubagentChatWorkflowPayload>(async (context) => {
  const { taskId, userId, agentSlug, chatId } = context.requestPayload;

  const result = await context.run("run-subagent-chat", async () => {
    const definition = getSubAgentBySlug(agentSlug);
    if (!definition) {
      await updateAgentTask({
        id: taskId,
        userId,
        status: "failed",
        result: { error: `Unknown agent slug: ${agentSlug}` },
      });
      return { success: false, error: `Unknown agent slug: ${agentSlug}` };
    }

    await updateAgentTask({ id: taskId, userId, status: "running" });

    // Load messages from Redis
    const messages = await getSubagentChatMessages(userId, agentSlug);

    // Extract last user message for memory recall context
    const lastUserMsg = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    const queryText =
      lastUserMsg?.parts
        ?.filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join(" ") ?? "";

    // Recall relevant memory
    const memoryContext = await recallRelevantMemory(userId, queryText);

    // Build tools
    let composioTools: Record<string, any> = {};
    try {
      const session = await composio.create(userId, {
        manageConnections: true,
      });
      composioTools = await session.tools();
    } catch {
      /* Composio optional */
    }

    const baseUrl =
      process.env.BASE_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : undefined) ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    const tools = {
      ...composioTools,
      ...buildTools(userId, agentSlug, baseUrl),
    };

    const systemPrompt = `${definition.systemPrompt}${memoryContext}\n\nToday's date is ${new Date().toLocaleDateString()}. Execute the task now. Summarize what you did.`;

    const subagentModel =
      process.env.SUBAGENT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
    const model = subagentModel.startsWith("google/")
      ? getGoogleModel(subagentModel)
      : getLanguageModel(subagentModel);

    // Convert ChatMessage[] to model messages format
    const { convertToModelMessages } = await import("ai");
    const modelMessages = await convertToModelMessages(messages as any);

    try {
      const genResult = await generateText({
        model,
        system: systemPrompt,
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(25),
      });

      // Build assistant ChatMessage from the result
      const assistantMessage: ChatMessage = {
        id: generateUUID(),
        role: "assistant",
        parts: [
          ...(genResult.text
            ? [{ type: "text" as const, text: genResult.text }]
            : []),
        ],
      } as any;

      // Save updated messages back to Redis
      const updatedMessages = [...messages, assistantMessage];
      await saveSubagentChatMessages(userId, agentSlug, updatedMessages);

      // Mark task as completed
      await updateAgentTask({
        id: taskId,
        userId,
        status: "completed",
        result: { text: genResult.text },
      });

      // If chatId provided, save ###AGENT_RESULT### to Postgres
      if (chatId) {
        const agentPayload = {
          agentType: definition.name,
          slug: agentSlug,
          task: queryText,
          taskId,
          result: genResult.text,
          timestamp: new Date().toISOString(),
        };

        await saveMessages({
          messages: [
            {
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
              createdAt: new Date(),
            },
          ],
        });
      }

      return { success: true, text: genResult.text };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);

      await updateAgentTask({
        id: taskId,
        userId,
        status: "failed",
        result: { error: errMsg },
      });

      // Save error message to Redis so the user sees it in chat
      const errorMessage: ChatMessage = {
        id: generateUUID(),
        role: "assistant",
        parts: [
          {
            type: "text" as const,
            text: `⚠️ An error occurred while running this task: ${errMsg}`,
          },
        ],
      } as any;
      const updatedMessages = [...messages, errorMessage];
      await saveSubagentChatMessages(userId, agentSlug, updatedMessages);

      return { success: false, error: errMsg };
    }
  });

  return {
    success: result.success,
    taskId,
    error: result.error,
  };
});
