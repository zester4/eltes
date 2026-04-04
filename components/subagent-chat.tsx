import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Terminal, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { Response } from "@/components/elements/response";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/elements/tool";
import type { SubAgentDefinition } from "@/lib/agent/subagent-definitions";
import { toast } from "sonner";
import { SparklesIcon } from "@/components/icons";
import type { ChatMessage } from "@/lib/types";

interface SubAgentChatProps {
  agent: SubAgentDefinition;
  onClearChat?: () => void;
  onClose?: () => void;
}

const POLL_INTERVAL_FAST = 2000; // 2s for the first 10s
const POLL_INTERVAL_SLOW = 4000; // 4s after that

export function SubAgentChat({
  agent,
  onClearChat,
  onClose,
}: SubAgentChatProps) {
  const [input, setInput] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isFetchingInitial, setIsFetchingInitial] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartTimeRef = useRef<number>(0);

  // ── Load initial chat history ──────────────────────────────────────────────
  useEffect(() => {
    setIsFetchingInitial(true);
    fetch(`/api/subagents/chat/history?agentSlug=${agent.slug}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.messages) {
          setMessages(data.messages);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch sub-agent chat history", err);
      })
      .finally(() => {
        setIsFetchingInitial(false);
      });
  }, [agent.slug]);

  // ── Auto-scroll on new messages ────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Cleanup polling on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  // ── Polling logic ──────────────────────────────────────────────────────────
  const pollForCompletion = useCallback(
    (taskId: string) => {
      const elapsed = Date.now() - pollStartTimeRef.current;
      const interval =
        elapsed < 10000 ? POLL_INTERVAL_FAST : POLL_INTERVAL_SLOW;

      pollTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/subagents/chat?agentSlug=${agent.slug}&taskId=${taskId}`,
          );
          if (!res.ok) {
            console.error("[Poll] Non-OK response:", res.status);
            pollForCompletion(taskId);
            return;
          }

          const data = await res.json();
          const { messages: latestMessages, taskStatus } = data;

          if (latestMessages) {
            setMessages(latestMessages);
          }

          if (taskStatus === "completed" || taskStatus === "failed") {
            setIsWorking(false);
            setActiveTaskId(null);
            if (taskStatus === "failed") {
              toast.error("The agent encountered an error.");
            }
            return;
          }

          // Still running — continue polling
          pollForCompletion(taskId);
        } catch (err) {
          console.error("[Poll] Error:", err);
          // Retry polling on network errors
          pollForCompletion(taskId);
        }
      }, interval);
    },
    [agent.slug],
  );

  // ── Send message ───────────────────────────────────────────────────────────
  const handleInputSubmit = async (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault();
    if (!input.trim() || isWorking) return;

    const userMessage: ChatMessage = {
      id: generateUUID(),
      role: "user",
      parts: [{ type: "text", text: input }],
    } as any;

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsWorking(true);

    try {
      const res = await fetch("/api/subagents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          agentSlug: agent.slug,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Request failed with status ${res.status}`);
      }

      const data = await res.json();
      const { taskId } = data;

      if (taskId) {
        setActiveTaskId(taskId);
        pollStartTimeRef.current = Date.now();
        pollForCompletion(taskId);
      } else {
        // No task ID — something weird happened
        setIsWorking(false);
        toast.error("Failed to submit message to agent.");
      }
    } catch (err) {
      console.error("[SubAgentChat] Send error:", err);
      setIsWorking(false);
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to communicate with sub-agent",
      );
    }
  };

  // ── Clear chat ─────────────────────────────────────────────────────────────
  const handleClear = async () => {
    try {
      // Cancel any active polling
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setIsWorking(false);
      setActiveTaskId(null);

      await fetch(`/api/subagents/chat/history?agentSlug=${agent.slug}`, {
        method: "DELETE",
      });
      setMessages([]);
      if (onClearChat) onClearChat();
      toast.success("Chat history cleared");
    } catch (error) {
      toast.error("Failed to clear chat history");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background/50 backdrop-blur-xl border-l overflow-hidden relative shadow-2xl md:shadow-none w-full">
      {/* Header */}
      <div className="flex-none p-3 sm:p-4 border-b bg-background/80 flex items-center justify-between sticky top-0 z-10 w-full">
        <div className="flex items-center gap-3">
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden shrink-0"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h2 className="font-semibold text-sm sm:text-base flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary" />
              {agent.name}
            </h2>
            <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
              <span className="relative flex h-2 w-2">
                {isWorking && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                )}
                <span
                  className={cn(
                    "relative inline-flex rounded-full h-2 w-2",
                    isWorking ? "bg-primary" : "bg-muted-foreground/50",
                  )}
                ></span>
              </span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                {isWorking ? "Running tasks..." : "Idle"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            className="h-7 sm:h-8 px-2 sm:px-3 text-[10px] sm:text-xs"
          >
            <RefreshCw className="w-3 h-3 mr-1.5" />
            <span className="hidden sm:inline">Reset</span>
          </Button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 w-full">
        {isFetchingInitial ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3 sm:space-y-4">
            <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin opacity-50" />
            <span className="text-[11px] sm:text-sm font-medium">
              Loading history...
            </span>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3 sm:space-y-4">
            <div className="p-3 sm:p-4 rounded-full bg-muted/50 border border-muted ring-1 ring-border shadow-sm">
              <SparklesIcon size={24} />
            </div>
            <p className="text-center max-w-sm text-xs sm:text-sm">
              <span className="block font-semibold text-foreground mb-1">
                Direct channel to {agent.name}.
              </span>
              What would you like to delegate?
            </p>
          </div>
        ) : (
          <div className="space-y-6 sm:space-y-8 w-full">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex w-full",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "flex flex-col gap-2 sm:gap-3 w-full",
                    message.role === "user"
                      ? "max-w-[85%] sm:max-w-xl"
                      : "max-w-full lg:max-w-3xl",
                  )}
                >
                  <div className="text-[10px] sm:text-xs font-semibold text-muted-foreground ml-1 flex items-center gap-2 uppercase tracking-wide">
                    {message.role === "user" ? "You" : agent.name}
                  </div>

                  {/* Render parts: Text and Tool Invocations */}
                  {message.parts &&
                    message.parts.map((part, index) => {
                      const key = `${message.id}-part-${index}`;

                      if (part.type === "text" && part.text) {
                        return (
                          <div
                            key={key}
                            className={cn(
                              "text-xs sm:text-[13px] leading-relaxed",
                              message.role === "user"
                                ? "bg-primary text-primary-foreground px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl rounded-tr-sm shadow-sm"
                                : "bg-transparent w-full",
                            )}
                          >
                            {message.role === "user" ? (
                              <span className="whitespace-pre-wrap">
                                {part.text}
                              </span>
                            ) : (
                              <Response>{part.text}</Response>
                            )}
                          </div>
                        );
                      }

                      if (
                        part.type.startsWith("tool-") &&
                        "toolCallId" in part &&
                        "state" in part
                      ) {
                        const { toolCallId, state, toolName } = part as any;
                        const isOutputAvailable =
                          state === "output-available" || state === "result";

                        const redirectUrl =
                          "output" in part &&
                          part.output &&
                          typeof part.output === "object"
                            ? (part.output as any).url ||
                              (part.output as any).redirectUrl
                            : undefined;

                        return (
                          <div
                            key={toolCallId || key}
                            className="w-full sm:w-[min(100%,500px)]"
                          >
                            <Tool
                              defaultOpen={!isOutputAvailable}
                              className="w-full"
                            >
                              <ToolHeader
                                state={
                                  isOutputAvailable
                                    ? "output-available"
                                    : "input-available"
                                }
                                type={toolName}
                              />
                              <ToolContent>
                                {"input" in part && part.input && (
                                  <ToolInput input={part.input} />
                                )}

                                {isOutputAvailable && redirectUrl && (
                                  <div className="px-4 pb-3">
                                    <Button
                                      asChild
                                      className="w-full gap-2"
                                      size="sm"
                                    >
                                      <a
                                        href={redirectUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        Connect Account
                                      </a>
                                    </Button>
                                  </div>
                                )}

                                {isOutputAvailable &&
                                  "result" in part &&
                                  part.result && (
                                    <ToolOutput output={part.result as any} />
                                  )}
                                {isOutputAvailable &&
                                  "output" in part &&
                                  part.output && (
                                    <ToolOutput output={part.output as any} />
                                  )}
                              </ToolContent>
                            </Tool>
                          </div>
                        );
                      }

                      return null;
                    })}
                </div>
              </div>
            ))}

            {/* Working indicator */}
            {isWorking && (
              <div className="flex justify-start">
                <div className="max-w-[85%] sm:max-w-xl flex flex-col gap-2">
                  <div className="text-[10px] sm:text-xs font-semibold text-muted-foreground ml-1 uppercase tracking-wide">
                    {agent.name}
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted/30 border border-muted/50">
                    <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                    <span className="text-xs sm:text-sm text-muted-foreground">
                      Working on your request...
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-4 sm:h-8" />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-none p-3 sm:p-4 bg-background/80 border-t w-full">
        <form
          onSubmit={handleInputSubmit}
          className="flex relative items-end w-full"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleInputSubmit(e);
              }
            }}
            placeholder={`Message ${agent.name}...`}
            className="w-full min-h-[60px] max-h-[200px] resize-none overflow-y-auto bg-muted/50 border border-muted rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 pr-12 focus:outline-none focus:ring-1 focus:ring-primary shadow-sm text-xs sm:text-[13px] transition-all"
            disabled={isWorking || isFetchingInitial}
            rows={2}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isWorking || isFetchingInitial}
            className="absolute right-1 sm:right-1.5 bottom-1.5 sm:bottom-2 h-8 w-8 sm:h-9 sm:w-9 rounded-full shrink-0"
          >
            {isWorking ? (
              <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
            ) : (
              <Send className="w-3 h-3 sm:w-4 sm:h-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
