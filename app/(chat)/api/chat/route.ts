//app/(chat)/api/chat/route.ts
import { geolocation, ipAddress } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessageStreamWriter,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { allowedModelIds, DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { guestRegex } from "@/lib/constants";
import {
  type RequestHints,
  systemPrompt,
  getBasePrompt,
  sessionTailPrompt,
  getRequestPromptFromHints,
} from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { editDocument } from "@/lib/ai/tools/edit-document";
import { generateImageTool } from "@/lib/ai/tools/generate-image";
import { generateVideoTool } from "@/lib/ai/tools/generate-video";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { renderChart } from "@/lib/ai/tools/render-chart";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { wikiQuery, wikiIngest } from "@/lib/ai/tools/wiki";
import {
  saveMemory,
  recallMemory,
  updateMemory,
  deleteMemory,
} from "@/lib/ai/tools/memory";
import { searchPastConversations } from "@/lib/ai/tools/search-history";
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
import { getSubAgentBySlug } from "@/lib/agent/subagent-definitions";
import { launchMission, getMissionStatus } from "@/lib/ai/tools/missions";
import { queueApproval } from "@/lib/ai/tools/queue-approval";
import {
  activateHeartbeat,
  getAgentSystemStatus,
  setMorningBriefingTime,
} from "@/lib/ai/tools/proactive";
import {
  upsertKnowledgeEntity,
  addKnowledgeRelation,
  getKnowledgeEntity,
  searchKnowledgeGraph,
  deleteKnowledgeEntity,
  deleteKnowledgeRelation,
} from "@/lib/ai/tools/knowledge-graph";
import {
  addGoal,
  updateGoal,
  logGoalProgress,
  listGoals,
  deleteGoal,
} from "@/lib/ai/tools/goals";
import {
  tavilySearch,
  tavilyExtract,
  tavilyCrawl,
  tavilyMap,
} from "@/lib/ai/tools/tavily-search";
import * as twilioTools from "@/lib/ai/tools/twilio";
import * as twilioWhatsApp from "@/lib/ai/tools/twilio-whatsapp";
import { getPersistentSandboxTools } from "@/lib/ai/tools/persistent-sandbox";
import { getSessionTail, saveSessionTail } from "@/lib/session-tail";
import { touchUserActivity } from "@/lib/user-activity";
import { getCachedSystemPrompt, setCachedSystemPrompt } from "@/lib/prompt-cache";
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
  upsertMessages,
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

    const isOnboarding = selectedChatModel === "onboarding_specialist";

    if (!isOnboarding && !allowedModelIds.has(selectedChatModel)) {
      return new ChatbotError("bad_request:api").toResponse();
    }

    const isGuest = guestRegex.test(session?.user?.email ?? "");
    await checkIpRateLimit(ipAddress(request), isGuest);

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
      await upsertMessages({
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
      after(async () => {
        await touchUserActivity(session.user.id);
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

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        const promptScope = isOnboarding ? "onboarding" : "main";
        const promptSignature = JSON.stringify({
          selectedChatModel,
          promptScope,
        });

        let basePrompt = await getCachedSystemPrompt({
          userId: session.user.id!,
          scope: promptScope,
          signature: promptSignature,
        });

        if (!basePrompt) {
          basePrompt = isOnboarding
            ? getSubAgentBySlug("onboarding_specialist")?.systemPrompt ??
              getBasePrompt({ selectedChatModel })
            : getBasePrompt({ selectedChatModel });

          await setCachedSystemPrompt({
            userId: session.user.id!,
            scope: promptScope,
            signature: promptSignature,
            prompt: basePrompt,
          });
        }

        const corePrompt = `${basePrompt}${sessionTailPrompt(
          sessionTail ?? []
        )}\n\n${getRequestPromptFromHints(requestHints)}`;

        const result = streamText({
          model: getLanguageModel(
            isOnboarding ? DEFAULT_CHAT_MODEL : selectedChatModel
          ),
          system: corePrompt,
          messages: modelMessages,
          stopWhen: stepCountIs(25),
            experimental_activeTools: [
                  "getWeather",
                  "generateImage",
                  "generateVideo",
                  "renderChart",
                  "createDocument",
                "updateDocument",
                "editDocument",
                "requestSuggestions",
                "saveMemory",
                "recallMemory",
                "searchPastConversations",
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
                "activateHeartbeat",
                "getAgentSystemStatus",
                "setMorningBriefingTime",
                "upsertKnowledgeEntity",
                "addKnowledgeRelation",
                "getKnowledgeEntity",
                "searchKnowledgeGraph",
                "deleteKnowledgeEntity",
                "deleteKnowledgeRelation",
                "addGoal",
                "updateGoal",
                "logGoalProgress",
                "listGoals",
                "deleteGoal",
                "tavilySearch",
                "tavilyExtract",
                "tavilyCrawl",
                "tavilyMap",
                "wikiQuery",
                "wikiIngest",
                // Twilio tools
                "twilioMakeCall",
                "twilioGetCall",
                "twilioListCalls",
                "twilioModifyCall",
                "twilioSendSMS",
                "twilioGetMessage",
                "twilioListMessages",
                "twilioListMyNumbers",
                "twilioSearchAvailableNumbers",
                "twilioProvisionNumber",
                "twilioReleaseNumber",
                "twilioUpdateNumber",
                "twilioWhatsAppSendMessage",
                "twilioWhatsAppGetMessage",
                "twilioWhatsAppListMessages",
                "twilioWhatsAppSendTemplate",
                "twilioWhatsAppCreateTemplate",
                "twilioWhatsAppListTemplates",
                "twilioWhatsAppGetTemplate",
                "twilioWhatsAppDeleteTemplate",
                "twilioWhatsAppSubmitApproval",
                "twilioWhatsAppGetApprovalStatus",
                "twilioWhatsAppListSenders",
                "sandboxStatus",
                "sandboxRun",
                "sandboxWriteFile",
                "sandboxReadFile",
                "sandboxListFiles",
                "sandboxInstall",
                "sandboxStartService",
                "sandboxReset",
                ...Object.keys(composioTools),
              ] as any,
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
            generateImage: generateImageTool(dataStream),
            generateVideo: generateVideoTool(),
            renderChart,
            wikiQuery: wikiQuery({ userId: session.user.id! }),
            wikiIngest: wikiIngest({ userId: session.user.id! }),
            createDocument: createDocument({
              session,
              dataStream,
              modelId: selectedChatModel,
            }),
            updateDocument: updateDocument({
              session,
              dataStream,
              modelId: selectedChatModel,
            }),
            editDocument: editDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
              modelId: selectedChatModel,
            }),
            // Memory tools (per-user Upstash Vector)
            saveMemory: saveMemory({ userId: session.user.id! }),
            recallMemory: recallMemory({ userId: session.user.id! }),
            searchPastConversations: searchPastConversations({ userId: session.user.id! }),
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
                    skipTelegram: true,
                  }),
                  activateHeartbeat: activateHeartbeat({
                    userId: session.user.id!,
                    baseUrl: process.env.BASE_URL || new URL(request.url).origin,
                  }),
                  getAgentSystemStatus: getAgentSystemStatus({ userId: session.user.id! }),
                  setMorningBriefingTime: setMorningBriefingTime({
                    userId: session.user.id!,
                    baseUrl: process.env.BASE_URL || new URL(request.url).origin,
                  }),
                  upsertKnowledgeEntity: upsertKnowledgeEntity({
                    userId: session.user.id!,
                  }),
                  addKnowledgeRelation: addKnowledgeRelation({
                    userId: session.user.id!,
                  }),
                  getKnowledgeEntity: getKnowledgeEntity({
                    userId: session.user.id!,
                  }),
                  searchKnowledgeGraph: searchKnowledgeGraph({
                    userId: session.user.id!,
                  }),
                  deleteKnowledgeEntity: deleteKnowledgeEntity({
                    userId: session.user.id!,
                  }),
                  deleteKnowledgeRelation: deleteKnowledgeRelation({
                    userId: session.user.id!,
                  }),
                  addGoal: addGoal({ userId: session.user.id! }),
                  updateGoal: updateGoal({ userId: session.user.id! }),
                  logGoalProgress: logGoalProgress({ userId: session.user.id! }),
                  listGoals: listGoals({ userId: session.user.id! }),
                  deleteGoal: deleteGoal({ userId: session.user.id! }),
                  tavilySearch,
                  tavilyExtract,
                  tavilyCrawl,
                  tavilyMap,
                  // Twilio Tools
                  twilioMakeCall: twilioTools.twilioMakeCall({ userId: session.user.id! }),
                  twilioGetCall: twilioTools.twilioGetCall({ userId: session.user.id! }),
                  twilioListCalls: twilioTools.twilioListCalls({ userId: session.user.id! }),
                  twilioModifyCall: twilioTools.twilioModifyCall({ userId: session.user.id! }),
                  twilioSendSMS: twilioTools.twilioSendSMS({ userId: session.user.id! }),
                  twilioGetMessage: twilioTools.twilioGetMessage({ userId: session.user.id! }),
                  twilioListMessages: twilioTools.twilioListMessages({ userId: session.user.id! }),
                  twilioListMyNumbers: twilioTools.twilioListMyNumbers({ userId: session.user.id! }),
                  twilioSearchAvailableNumbers: twilioTools.twilioSearchAvailableNumbers({ userId: session.user.id! }),
                  twilioProvisionNumber: twilioTools.twilioProvisionNumber({ userId: session.user.id! }),
                  twilioReleaseNumber: twilioTools.twilioReleaseNumber({ userId: session.user.id! }),
                  twilioUpdateNumber: twilioTools.twilioUpdateNumber({ userId: session.user.id! }),
                  // Twilio WhatsApp Tools
                  twilioWhatsAppSendMessage: twilioWhatsApp.twilioWhatsAppSendMessage({ userId: session.user.id! }),
                  twilioWhatsAppGetMessage: twilioWhatsApp.twilioWhatsAppGetMessage({ userId: session.user.id! }),
                  twilioWhatsAppListMessages: twilioWhatsApp.twilioWhatsAppListMessages({ userId: session.user.id! }),
                  twilioWhatsAppSendTemplate: twilioWhatsApp.twilioWhatsAppSendTemplate({ userId: session.user.id! }),
                  twilioWhatsAppCreateTemplate: twilioWhatsApp.twilioWhatsAppCreateTemplate({ userId: session.user.id! }),
                  twilioWhatsAppListTemplates: twilioWhatsApp.twilioWhatsAppListTemplates({ userId: session.user.id! }),
                  twilioWhatsAppGetTemplate: twilioWhatsApp.twilioWhatsAppGetTemplate({ userId: session.user.id! }),
                  twilioWhatsAppDeleteTemplate: twilioWhatsApp.twilioWhatsAppDeleteTemplate({ userId: session.user.id! }),
                  twilioWhatsAppSubmitApproval: twilioWhatsApp.twilioWhatsAppSubmitApproval({ userId: session.user.id! }),
                  twilioWhatsAppGetApprovalStatus: twilioWhatsApp.twilioWhatsAppGetApprovalStatus({ userId: session.user.id! }),
                  twilioWhatsAppListSenders: twilioWhatsApp.twilioWhatsAppListSenders({ userId: session.user.id! }),
                  // Persistent sandbox — Etles's "home computer" that survives sessions
                  ...getPersistentSandboxTools({ userId: session.user.id! }),
                }),
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
          // Only save messages that are not already in the DB (the new assistant response
          // and any tool calls/results generated in this turn).
          const newMessages = finishedMessages.filter(
            (fm) => !uiMessages.some((um) => um.id === fm.id)
          );

          if (newMessages.length > 0) {
            await saveMessages({
              messages: newMessages.map((currentMessage) => ({
                id: currentMessage.id,
                role: currentMessage.role,
                parts: currentMessage.parts,
                createdAt: new Date(),
                attachments: [],
                chatId: id,
              })),
            });
          }
        }

        if (session?.user?.id) {
          after(async () => {
            const tail = finishedMessages
              .filter((m) => m.role === "user" || m.role === "assistant")
              .slice(-5)
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