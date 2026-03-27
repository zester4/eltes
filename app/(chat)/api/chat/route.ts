//app/(chat)/api/chat/route.ts
import { geolocation, ipAddress } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { allowedModelIds } from "@/lib/ai/models";
import { guestRegex } from "@/lib/constants";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { renderChart } from "@/lib/ai/tools/render-chart";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
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
import {
  setupTrigger,
  listActiveTriggers,
  removeTrigger,
} from "@/lib/ai/tools/triggers";
import {
  delegateToSubAgent,
  getSubAgentResult,
  listSubAgents,
} from "@/lib/ai/tools/subagents";
import { launchMission, getMissionStatus } from "@/lib/ai/tools/missions";
import { queueApproval } from "@/lib/ai/tools/queue-approval";
// Daytona sandbox tools
import {
  createSandbox,
  listSandboxes,
  deleteSandbox,
  executeCommand,
  runCode,
  listFiles,
  readFile,
  writeFile,
  createDirectory,
  searchFiles,
  replaceInFiles,
  gitClone,
  gitStatus,
  gitCommit,
  gitPush,
  gitPull,
  gitBranch,
} from "@/lib/ai/tools/daytona";
import { getSessionTail, saveSessionTail } from "@/lib/session-tail";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimit } from "@/lib/ratelimit";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

const composio = new Composio({ provider: new VercelProvider() });

export const maxDuration = 60;

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export { getStreamContext };

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const { id, message, messages, selectedChatModel, selectedVisibilityType } =
      requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    if (!allowedModelIds.has(selectedChatModel)) {
      return new ChatbotError("bad_request:api").toResponse();
    }

    await checkIpRateLimit(ipAddress(request));

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 1,
    });

    if (
      messageCount >=
      (entitlementsByUserType[userType] as any).maxMessagesPerHour
    ) {
      return new ChatbotError("rate_limit:chat").toResponse();
    }

    const isToolApprovalFlow = Boolean(messages);

    const chat = await getChatById({ id });
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatbotError("forbidden:chat").toResponse();
      }
      if (!isToolApprovalFlow) {
        messagesFromDb = await getMessagesByChatId({ id });
      }
    } else if (message?.role === "user") {
      await saveChat({
        id,
        userId: session.user.id,
        title: "New chat",
        visibility: selectedVisibilityType,
      });
      titlePromise = generateTitleFromUserMessage({ message });
    }

    let sessionTail = !chat
      ? await getSessionTail(session.user.id)
      : undefined;

    const isGuest = guestRegex.test(session?.user?.email ?? "");

    // Onboarding check for new users (no chat history) — Authenticated users only
    if (!chat && !isGuest) {
      try {
        const index = new (await import("@upstash/vector")).Index({
          url: process.env.UPSTASH_VECTOR_REST_URL!,
          token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
        });
        const ns = index.namespace(`memory-${session.user.id}`);
        const onboarding = await ns.fetch(["onboarding_complete"]);
        if (!onboarding || onboarding.length === 0) {
          // User hasn't finished setup — inject onboarding instructions into session tail
          const onboardingTail = {
            role: "assistant" as const,
            text: "SYSTEM: User is new. You MUST start with a guided setup: 'Hi! I'm Etles. Let's take 2 minutes to set you up. What do you do for work? what apps do you use (Gmail, Slack, GitHub, etc.)?' Proactively save every answer using saveMemory. When they finish, saveMemory with key 'onboarding_complete' to register their background jobs.",
          };
          sessionTail = sessionTail ? [...sessionTail, onboardingTail] : [onboardingTail];
        }
      } catch (e) {
        console.error("Onboarding check failed:", e);
      }
    }

    const uiMessages = isToolApprovalFlow
      ? (messages as ChatMessage[])
      : [...convertToUIMessages(messagesFromDb), message as ChatMessage];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    if (message?.role === "user") {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    const isReasoningModel =
      selectedChatModel.endsWith("-thinking") ||
      (selectedChatModel.includes("reasoning") &&
        !selectedChatModel.includes("non-reasoning"));

    const modelMessages = await convertToModelMessages(uiMessages);

    let composioTools: Record<string, any> = {};
    if (session?.user?.id && !isGuest) {
      try {
        const composioSession = await composio.create(session.user.id, {
          manageConnections: true,
        });
        composioTools = await composioSession.tools();
      } catch (error) {
        console.error("Failed to initialize Composio tools:", error);
      }
    }

    // Daytona sandbox tools — authenticated users only (sandbox compute has real cost)
    const sandboxTools = isGuest
      ? {}
      : {
          createSandbox: createSandbox({ userId: session.user.id! }),
          listSandboxes: listSandboxes({ userId: session.user.id! }),
          deleteSandbox: deleteSandbox({ userId: session.user.id! }),
          executeCommand: executeCommand({ userId: session.user.id! }),
          runCode: runCode({ userId: session.user.id! }),
          listFiles: listFiles({ userId: session.user.id! }),
          readFile: readFile({ userId: session.user.id! }),
          writeFile: writeFile({ userId: session.user.id! }),
          createDirectory: createDirectory({ userId: session.user.id! }),
          searchFiles: searchFiles({ userId: session.user.id! }),
          replaceInFiles: replaceInFiles({ userId: session.user.id! }),
          gitClone: gitClone({ userId: session.user.id! }),
          gitStatus: gitStatus({ userId: session.user.id! }),
          gitCommit: gitCommit({ userId: session.user.id! }),
          gitPush: gitPush({ userId: session.user.id! }),
          gitPull: gitPull({ userId: session.user.id! }),
          gitBranch: gitBranch({ userId: session.user.id! }),
        };

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        const result = streamText({
          model: getLanguageModel(selectedChatModel),
          system: systemPrompt({
            selectedChatModel,
            requestHints,
            sessionTail,
          }),
          messages: modelMessages,
          stopWhen: stepCountIs(25),
          experimental_activeTools: (isReasoningModel
            ? []
            : [
                "getWeather",
                "renderChart",
                "createDocument",
                "updateDocument",
                "requestSuggestions",
                "saveMemory",
                "recallMemory",
                "updateMemory",
                "deleteMemory",
                "setReminder",
                "setCronJob",
                "listSchedules",
                "deleteSchedule",
                "setupTrigger",
                "listActiveTriggers",
                "removeTrigger",
                "delegateToSubAgent",
                "getSubAgentResult",
                "listSubAgents",
                "launchMission",
                "getMissionStatus",
                "queueApproval",
                ...Object.keys(sandboxTools),
                ...Object.keys(composioTools),
              ]) as any,
          providerOptions: isReasoningModel
            ? {
                anthropic: {
                  thinking: { type: "enabled", budgetTokens: 10_000 },
                },
              }
            : undefined,
          tools: {
            ...composioTools,
            getWeather,
            renderChart,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({ session, dataStream }),
            // Memory tools (per-user Upstash Vector)
            saveMemory: saveMemory({ userId: session.user.id! }),
            recallMemory: recallMemory({ userId: session.user.id! }),
            updateMemory: updateMemory({ userId: session.user.id! }),
            deleteMemory: deleteMemory({ userId: session.user.id! }),
            // Scheduling tools (QStash)
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
            // Trigger management tools
            setupTrigger: setupTrigger({ userId: session.user.id! }),
            listActiveTriggers: listActiveTriggers({ userId: session.user.id! }),
            removeTrigger: removeTrigger(),
            // Sub-agent delegation (guest users get listSubAgents only)
            ...(isGuest
              ? { listSubAgents: listSubAgents() }
              : {
                  delegateToSubAgent: delegateToSubAgent({
                    userId: session.user.id!,
                    chatId: id,
                    baseUrl: process.env.BASE_URL || new URL(request.url).origin,
                  }),
                  getSubAgentResult: getSubAgentResult({ userId: session.user.id! }),
                  listSubAgents: listSubAgents(),
                  launchMission: launchMission({
                    userId: session.user.id!,
                    chatId: id,
                    baseUrl: process.env.BASE_URL || new URL(request.url).origin,
                  }),
                  getMissionStatus: getMissionStatus({ userId: session.user.id! }),
                  queueApproval: queueApproval({
                    userId: session.user.id!,
                    chatId: id,
                  }),
                }),
            // Daytona sandbox tools (authenticated users only)
            ...(sandboxTools as any),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });

        dataStream.merge(
          result.toUIMessageStream({ sendReasoning: isReasoningModel })
        );

        if (titlePromise) {
          const title = await titlePromise;
          dataStream.write({ type: "data-chat-title", data: title });
          updateChatTitleById({ chatId: id, title });
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        if (isToolApprovalFlow) {
          for (const finishedMsg of finishedMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
            if (existingMsg) {
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: id,
                  },
                ],
              });
            }
          }
        } else if (finishedMessages.length > 0) {
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              id: currentMessage.id,
              role: currentMessage.role,
              parts: currentMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
          });
        }

        if (session?.user?.id) {
          after(async () => {
            const tail = finishedMessages
              .filter((m) => m.role === "user" || m.role === "assistant")
              .slice(-2)
              .map((m) => ({
                role: m.role as "user" | "assistant",
                text: m.parts
                  .filter((p) => p.type === "text")
                  .map((p) => (p as any).text)
                  .join("\n"),
              }));

            await saveSessionTail(session.user.id, tail);
          });
        }
      },
      onError: (error) => {
        if (
          error instanceof Error &&
          error.message?.includes(
            "AI Gateway requires a valid credit card on file to service requests"
          )
        ) {
          return "AI Gateway requires a valid credit card on file to service requests. Please visit https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card to add a card and unlock your free credits.";
        }
        return "Oops, an error occurred!";
      },
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamId = generateId();
            await createStreamId({ streamId, chatId: id });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
          }
        } catch (_) {
          // ignore redis errors
        }
      },
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatbotError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatbotError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}