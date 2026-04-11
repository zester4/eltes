import type { UseChatHelpers } from "@ai-sdk/react";
import { ArrowDownIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useMessages } from "@/hooks/use-messages";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { useDataStream } from "./data-stream-provider";
import { Greeting } from "./greeting";
import { PreviewMessage, ThinkingMessage } from "./message";
import { SupermodeLiveFeed } from "./supermode-live-feed";

type MessagesProps = {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  status: UseChatHelpers<ChatMessage>["status"];
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  isArtifactVisible: boolean;
  selectedModelId: string;
  highlightTaskId?: string | null;
  onHighlightConsumed?: () => void;
};

function PureMessages({
  addToolApprovalResponse,
  chatId,
  status,
  votes,
  messages,
  setMessages,
  regenerate,
  isReadonly,
  selectedModelId: _selectedModelId,
  highlightTaskId,
  onHighlightConsumed,
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
  } = useMessages({
    status,
  });

  const highlightFailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    if (!highlightTaskId) {
      return undefined;
    }
    highlightFailTimerRef.current = setTimeout(() => {
      onHighlightConsumed?.();
    }, 12_000);
    return () => {
      if (highlightFailTimerRef.current) {
        clearTimeout(highlightFailTimerRef.current);
        highlightFailTimerRef.current = null;
      }
    };
  }, [highlightTaskId, onHighlightConsumed]);

  useEffect(() => {
    if (!highlightTaskId || !messagesContainerRef.current) {
      return undefined;
    }

    const root = messagesContainerRef.current;
    const escaped =
      typeof CSS !== "undefined" && "escape" in CSS
        ? CSS.escape(highlightTaskId)
        : highlightTaskId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const el = root.querySelector(`[data-agent-task-id="${escaped}"]`);

    if (!(el instanceof HTMLElement)) {
      return undefined;
    }

    if (highlightFailTimerRef.current) {
      clearTimeout(highlightFailTimerRef.current);
      highlightFailTimerRef.current = null;
    }

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add(
      "ring-2",
      "ring-primary",
      "ring-offset-2",
      "ring-offset-background",
    );

    const clearRing = window.setTimeout(() => {
      el.classList.remove(
        "ring-2",
        "ring-primary",
        "ring-offset-2",
        "ring-offset-background",
      );
      onHighlightConsumed?.();
    }, 3200);

    return () => {
      window.clearTimeout(clearRing);
      el.classList.remove(
        "ring-2",
        "ring-primary",
        "ring-offset-2",
        "ring-offset-background",
      );
    };
  }, [highlightTaskId, messages, onHighlightConsumed]);

  useDataStream();

  return (
    <div className="relative flex-1 bg-background">
      <div
        className="absolute inset-0 touch-pan-y overflow-y-auto bg-background"
        ref={messagesContainerRef}
      >
        <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-3 px-2 py-3 md:gap-4 md:px-3">
          {messages.length === 0 && <Greeting />}

          {messages.map((message, index) => (
            <PreviewMessage
              addToolApprovalResponse={addToolApprovalResponse}
              chatId={chatId}
              isLoading={
                status === "streaming" && messages.length - 1 === index
              }
              isReadonly={isReadonly}
              key={message.id}
              message={message}
              regenerate={regenerate}
              requiresScrollPadding={
                hasSentMessage && index === messages.length - 1
              }
              setMessages={setMessages}
              vote={
                votes
                  ? votes.find((vote) => vote.messageId === message.id)
                  : undefined
              }
            />
          ))}

          <SupermodeLiveFeed chatId={chatId} />

          {status === "submitted" &&
            !messages.some((msg) =>
              msg.parts?.some(
                (part) => "state" in part && part.state === "approval-responded"
              )
            ) && <ThinkingMessage />}

          <div
            className="min-h-[24px] min-w-[24px] shrink-0"
            ref={messagesEndRef}
          />
        </div>
      </div>

      <button
        aria-label="Scroll to bottom"
        className={`absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background p-1.5 shadow transition-all hover:bg-muted ${
          isAtBottom
            ? "pointer-events-none scale-0 opacity-0"
            : "pointer-events-auto scale-100 opacity-100"
        }`}
        onClick={() => scrollToBottom("smooth")}
        type="button"
      >
        <ArrowDownIcon className="size-3.5" />
      </button>
    </div>
  );
}

export const Messages = PureMessages;
