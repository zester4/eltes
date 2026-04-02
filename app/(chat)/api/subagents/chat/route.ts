import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import { type NextRequest } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { guestRegex } from "@/lib/constants";
import { getGoogleModel, getLanguageModel } from "@/lib/ai/providers";
import { getSubAgentBySlug } from "@/lib/agent/subagent-definitions";
import { ChatbotError } from "@/lib/errors";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
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
import { generateUUID } from "@/lib/utils";
import { saveSubagentChatMessages, getSubagentChatMessages } from "@/lib/subagent-redis";
import type { ChatMessage } from "@/lib/types";
import { saveMessages } from "@/lib/db/queries";

const composio = new Composio({ provider: new VercelProvider() });

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    // console.log("[Subagent Chat] Request body:", JSON.stringify(json, null, 2));
    
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
      console.error("[Subagent Chat] Missing agentSlug or messages:", { agentSlug, hasMessages: !!messages });
      return new ChatbotError("bad_request:api").toResponse();
    }

    const session = await auth();

    if (!session?.user?.id) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const isGuest = guestRegex.test(session.user.email ?? "");
    if (isGuest) {
      return new ChatbotError("forbidden:chat", "Guests cannot use subagents directly.").toResponse();
    }

    const definition = getSubAgentBySlug(agentSlug);
    if (!definition) {
      return new ChatbotError("bad_request:api", `Unknown subagent slug: ${agentSlug}`).toResponse();
    }

    const previousRedisMessages = await getSubagentChatMessages(session.user.id, agentSlug);
    
    // We append the single new incoming message to redis right away.
    // However, the `messages` array in the request body usually contains the full history from the client.
    // Let's just trust the client payload for execution, and async save it to Redis.
    await saveSubagentChatMessages(session.user.id, agentSlug, messages);

    const modelMessages = await convertToModelMessages(messages);

    let composioTools: Record<string, any> = {};
    try {
      const composioSession = await composio.create(session.user.id, {
        manageConnections: true,
      });
      composioTools = await composioSession.tools();
    } catch (error) {
      console.error("Failed to initialize Composio tools:", error);
    }

    const subagentModel = process.env.SUBAGENT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
    const model = subagentModel.startsWith("google/")
        ? getGoogleModel(subagentModel)
        : getLanguageModel(subagentModel);

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        const result = streamText({
          model,
          system: `${definition.systemPrompt}\n\nToday's date is ${new Date().toLocaleDateString()}. Execute the task now. Summarize what you did.`,
          messages: modelMessages,
          stopWhen: stepCountIs(25),
          tools: {
            ...composioTools,
            saveMemory: saveMemory({ userId: session.user.id! }),
            recallMemory: recallMemory({ userId: session.user.id! }),
            updateMemory: updateMemory({ userId: session.user.id! }),
            deleteMemory: deleteMemory({ userId: session.user.id! }),
            setReminder: setReminder({
              userId: session.user.id!,
              baseUrl: process.env.BASE_URL || new URL(request.url).origin,
            }),
            setCronJob: setCronJob({
              userId: session.user.id!,
              baseUrl: process.env.BASE_URL || new URL(request.url).origin,
            }),
            listSchedules: listSchedules({ userId: session.user.id! }),
            deleteSchedule: deleteSchedule(),

            // Daytona Sandbox Tools (Sandbox Specialist + Browser Operator for Playwright)
            ...(agentSlug === "sandbox_specialist" || agentSlug === "browser_operator"
              ? {
                  createSandbox: daytonaTools.createSandbox({ userId: session.user.id! }),
                  listSandboxes: daytonaTools.listSandboxes({ userId: session.user.id! }),
                  deleteSandbox: daytonaTools.deleteSandbox({ userId: session.user.id! }),
                  executeCommand: daytonaTools.executeCommand({ userId: session.user.id! }),
                  runCode: daytonaTools.runCode({ userId: session.user.id! }),
                  listFiles: daytonaTools.listFiles({ userId: session.user.id! }),
                  readFile: daytonaTools.readFile({ userId: session.user.id! }),
                  writeFile: daytonaTools.writeFile({ userId: session.user.id! }),
                  createDirectory: daytonaTools.createDirectory({ userId: session.user.id! }),
                  searchFiles: daytonaTools.searchFiles({ userId: session.user.id! }),
                  replaceInFiles: daytonaTools.replaceInFiles({ userId: session.user.id! }),
                  gitClone: daytonaTools.gitClone({ userId: session.user.id! }),
                  gitStatus: daytonaTools.gitStatus({ userId: session.user.id! }),
                  gitCommit: daytonaTools.gitCommit({ userId: session.user.id! }),
                  gitPush: daytonaTools.gitPush({ userId: session.user.id! }),
                  gitPull: daytonaTools.gitPull({ userId: session.user.id! }),
                  gitBranch: daytonaTools.gitBranch({ userId: session.user.id! }),
                  getPreviewLink: daytonaTools.getPreviewLink({ userId: session.user.id! }),
                  runBackgroundProcess: daytonaTools.runBackgroundProcess({ userId: session.user.id! }),
                  lspDiagnostics: daytonaTools.lspDiagnostics({ userId: session.user.id! }),
                  archiveSandbox: daytonaTools.archiveSandbox({ userId: session.user.id! }),
                }
              : {}),

            // Browser Use Cloud Tools (Browser Operator only)
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
                  browserSetup: daytonaBrowserTools.browserSetup({ userId: session.user.id! }),
                  browserNavigate: daytonaBrowserTools.browserNavigate({ userId: session.user.id! }),
                  browserInteract: daytonaBrowserTools.browserInteract({ userId: session.user.id! }),
                  browserExtract: daytonaBrowserTools.browserExtract({ userId: session.user.id! }),
                  browserMultiTab: daytonaBrowserTools.browserMultiTab({ userId: session.user.id! }),
                  browserUploadFile: daytonaBrowserTools.browserUploadFile({ userId: session.user.id! }),
                  browserScreenshot: daytonaBrowserTools.browserScreenshot({ userId: session.user.id! }),
                  browserVisualInteract: daytonaBrowserTools.browserVisualInteract({ userId: session.user.id! }),
                }
              : {}),
          },
        });

        // Merge standard AI responses
        dataStream.merge(result.toUIMessageStream());
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        // Find the new assistant messages added during this run
        const newMessages = finishedMessages.filter((fm: any) => !messages.some((m) => m.id === fm.id));
        
        await saveSubagentChatMessages(
          session.user.id!, 
          agentSlug, 
          [...messages, ...(newMessages as unknown as ChatMessage[])]
        );

        // If a chatId was provided, it means this subagent was triggered/related 
        // to a specific main chat. We can save a ###AGENT_RESULT### message back to postgres
        if (chatId) {
          const assistantMsg = newMessages.find((m: any) => m.role === "assistant") as any;
          const textPart = assistantMsg?.parts?.find((p: any) => p.type === "text");
          const assistantText = textPart ? textPart.text : undefined;
          
          const agentPayload = {
            agentType: definition.name,
            slug: agentSlug,
            task: (messages[messages.length - 1]?.parts?.find((p: any) => p.type === "text") as any)?.text || "",
            taskId: generateUUID(),
            result: assistantText,
            timestamp: new Date().toISOString(),
          };

          await saveMessages({
            messages: [{
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
            }],
          });
        }
      },
      onError: (error) => {
        return "Oops, an error occurred while streaming the sub-agent response.";
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    console.error("Unhandled error in subagents chat API:", error);
    return new ChatbotError("offline:chat").toResponse();
  }
}
