//components/chat.tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import type { UIArtifact } from "@/components/artifact";
import { ChatHeader } from "@/components/chat-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useActiveAgentTasks } from "@/hooks/use-active-agent-tasks";
import { useArtifactSelector } from "@/hooks/use-artifact";
import { useAutoResume } from "@/hooks/use-auto-resume";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import type { Vote } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import type { Attachment, ChatMessage } from "@/lib/types";
import { fetcher, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { ActiveAgentTasksBanner } from "./active-agent-tasks-banner";
import { Artifact } from "./artifact";
import { useDataStream } from "./data-stream-provider";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { getChatHistoryPaginationKey } from "./sidebar-history";
import { toast } from "./toast";
import type { VisibilityType } from "./visibility-selector";

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  autoResume,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
}) {
  const router = useRouter();

  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { mutate } = useSWRConfig();

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      router.refresh();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [router]);

  // Refresh on tab focus to pick up new messages (scheduled results, sub-agent results, Composio events)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [router]);
  const { setDataStream } = useDataStream();
  const startPollingRef = useRef<((id: string) => void) | null>(null);

  const [input, setInput] = useState<string>("");
  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const currentModelIdRef = useRef(currentModelId);

  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    resumeStream,
    addToolApprovalResponse,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    generateId: generateUUID,
    sendAutomaticallyWhen: ({ messages: currentMessages }) => {
      const lastMessage = currentMessages.at(-1);
      const shouldContinue =
        lastMessage?.parts?.some(
          (part) =>
            part &&
            typeof part === "object" &&
            "state" in part &&
            part.state === "approval-responded" &&
            "approval" in part &&
            (part.approval as { approved?: boolean })?.approved === true
        ) ?? false;
      return shouldContinue;
    },
    transport: new DefaultChatTransport({
      api: "/api/chat",
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest(request) {
        const lastMessage = request.messages.at(-1);
        const isToolApprovalContinuation =
          lastMessage?.role !== "user" ||
          (lastMessage?.parts?.some((part) => {
            if (!part || typeof part !== "object") {
              return false;
            }
            const state = (part as { state?: string }).state;
            return (
              state === "approval-responded" || state === "output-denied"
            );
          }) ?? false);

        return {
          body: {
            id: request.id,
            ...(isToolApprovalContinuation
              ? { messages: request.messages }
              : { message: lastMessage }),
            selectedChatModel: currentModelIdRef.current,
            selectedVisibilityType: visibilityType,
            ...request.body,
          },
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));

      if ((dataPart as any).type === "data-workflow-run") {
        const workflowRunId = (dataPart as any).data?.workflowRunId;
        if (workflowRunId && startPollingRef.current) {
          startPollingRef.current(workflowRunId);
        }
      }
    },
    onFinish: () => {
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      if (error.message?.includes("AI Gateway requires a valid credit card")) {
        setShowCreditCardAlert(true);
      } else if (error instanceof ChatbotError) {
        toast({
          type: "error",
          description: error.message,
        });
      } else {
        toast({
          type: "error",
          description: error.message || "Oops, an error occurred!",
        });
      }
    },
  });

  const searchParams = useSearchParams();
  const query = searchParams.get("query");
  const highlightTaskId = searchParams.get("highlightTask");

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  const { tasks: activeAgentTasks } = useActiveAgentTasks(id);
  const prevAgentTaskCountRef = useRef(0);
  const postAgentActivityUntilRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevAgentTaskCountRef.current;
    if (prev > 0 && activeAgentTasks.length === 0) {
      postAgentActivityUntilRef.current = Date.now() + 60_000;
    }
    prevAgentTaskCountRef.current = activeAgentTasks.length;
  }, [activeAgentTasks.length]);

  useEffect(() => {
    let cancelled = false;

    const syncFromServer = async () => {
      try {
        const res = await fetch(`/api/chat/${id}/messages`);
        if (!res.ok || cancelled) {
          return;
        }
        const data = (await res.json()) as { messages?: ChatMessage[] };
        const incoming = data.messages;
        if (!incoming || cancelled) {
          return;
        }
        setMessages((prev) => {
          if (prev.length !== incoming.length) {
            return incoming;
          }
          const lastPrev = prev.at(-1)?.id;
          const lastNew = incoming.at(-1)?.id;
          if (lastPrev !== lastNew) {
            return incoming;
          }
          return prev;
        });
      } catch {
        /* ignore */
      }
    };

    const tick = () => {
      if (cancelled) {
        return;
      }

      const postDeadline = postAgentActivityUntilRef.current;
      if (postDeadline !== null && Date.now() >= postDeadline) {
        postAgentActivityUntilRef.current = null;
      }

      const stillPostActive =
        postAgentActivityUntilRef.current !== null &&
        Date.now() < postAgentActivityUntilRef.current;
      const shouldPoll = activeAgentTasks.length > 0 || stillPostActive;
      if (!shouldPoll) {
        return;
      }
      if (status === "streaming" || status === "submitted") {
        return;
      }

      void syncFromServer();
    };

    tick();
    const intervalId = setInterval(tick, 4000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [id, activeAgentTasks.length, status, setMessages]);

  const handleHighlightConsumed = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    const u = new URL(window.location.href);
    if (!u.searchParams.has("highlightTask")) {
      return;
    }
    u.searchParams.delete("highlightTask");
    const next = `${u.pathname}${u.search}`;
    window.history.replaceState({}, "", next);
  }, []);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessage({
        role: "user" as const,
        parts: [{ type: "text", text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, "", `/chat/${id}`);
    }
  }, [query, sendMessage, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher
  );

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const selectArtifactVisible = useCallback(
    (state: UIArtifact) => state.isVisible,
    []
  );
  const isArtifactVisible = useArtifactSelector(selectArtifactVisible);

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
  });

  return (
    <>
      <div className="overscroll-behavior-contain flex h-dvh min-w-0 touch-pan-y flex-col bg-background">
        <ChatHeader
          chatId={id}
          isReadonly={isReadonly}
          selectedVisibilityType={initialVisibilityType}
        />

        <ActiveAgentTasksBanner chatId={id} />

        <Messages
          addToolApprovalResponse={addToolApprovalResponse}
          chatId={id}
          highlightTaskId={highlightTaskId}
          isArtifactVisible={isArtifactVisible}
          isReadonly={isReadonly}
          messages={messages}
          onHighlightConsumed={handleHighlightConsumed}
          regenerate={regenerate}
          selectedModelId={initialChatModel}
          setMessages={setMessages}
          status={status}
          votes={votes}
        />

        <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background/95 px-2 pb-2.5 backdrop-blur-sm md:px-3 md:pb-3">
          {!isReadonly && (
            <MultimodalInput
              attachments={attachments}
              chatId={id}
              input={input}
              messages={messages}
              onModelChange={setCurrentModelId}
              selectedModelId={currentModelId}
              selectedVisibilityType={visibilityType}
              sendMessage={sendMessage}
              setAttachments={setAttachments}
              setInput={setInput}
              setMessages={setMessages}
              status={status}
              stop={stop}
            />
          )}
        </div>
      </div>

      <Artifact
        addToolApprovalResponse={addToolApprovalResponse}
        attachments={attachments}
        chatId={id}
        input={input}
        isReadonly={isReadonly}
        messages={messages}
        regenerate={regenerate}
        selectedModelId={currentModelId}
        selectedVisibilityType={visibilityType}
        sendMessage={sendMessage}
        setAttachments={setAttachments}
        setInput={setInput}
        setMessages={setMessages}
        status={status}
        stop={stop}
        votes={votes}
      />

      <AlertDialog
        onOpenChange={setShowCreditCardAlert}
        open={showCreditCardAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate AI Gateway</AlertDialogTitle>
            <AlertDialogDescription>
              This application requires{" "}
              {process.env.NODE_ENV === "production" ? "the owner" : "you"} to
              activate Vercel AI Gateway.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.open(
                  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card",
                  "_blank"
                );
                window.location.href = "/chat";
              }}
            >
              Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
