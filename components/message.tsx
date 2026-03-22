//components/message.tsx
"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ChartToolPayload } from "@/lib/ai/tools/render-chart";
import { parseSubAgentHandoffMarker } from "@/lib/agent/sub-agent-handoff-markers";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn, sanitizeText } from "@/lib/utils";
import { useDataStream } from "./data-stream-provider";
import { DocumentToolResult } from "./document";
import { DocumentPreview } from "./document-preview";
import { AgentActionCard, parseAgentMessage } from "./elements/agent-action";
import { ChartDisplay } from "./elements/chart-display";
import { EventCard, parseEventMessage } from "./elements/event";
import { MessageContent } from "./elements/message";
import { Response } from "./elements/response";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "./elements/tool";
import { SparklesIcon } from "./icons";
import { MessageActions } from "./message-actions";
import { MessageEditor } from "./message-editor";
import { MessageReasoning } from "./message-reasoning";
import { PreviewAttachment } from "./preview-attachment";
import { Button } from "./ui/button";
import { Weather } from "./weather";

const PurePreviewMessage = ({
  addToolApprovalResponse,
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  regenerate,
  isReadonly,
  requiresScrollPadding: _requiresScrollPadding,
}: {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
}) => {
  const [mode, setMode] = useState<"view" | "edit">("view");

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === "file"
  );

  useDataStream();

  const role = message.role as string;
  const isAssistant = role === "assistant";
  const isTool = role === "tool";
  const hasVisibleContent = message.parts.some((part: any) => {
    const type = part.type;
    if (type === "text" && part.text?.trim()) {
      return true;
    }
    if (type === "reasoning" && part.text?.trim()) {
      return true;
    }
    if (
      [
        "file",
        "image",
        "imageDelta",
        "sheetDelta",
        "codeDelta",
        "suggestion",
      ].includes(type)
    ) {
      return true;
    }
    if (
      typeof type === "string" &&
      type.startsWith("tool-") &&
      type !== "tool-call" &&
      type !== "tool-result" &&
      !type.includes("invocation")
    ) {
      return true;
    }

    // Everything else (tool-call, tool-result, etc.) is considered non-visible for the main bubble
    return false;
  });

  if ((isAssistant || isTool) && !hasVisibleContent && !isLoading) {
    return null;
  }

  return (
    <div
      className="group/message fade-in w-full animate-in duration-200"
      data-role={message.role}
      data-testid={`message-${message.role}`}
    >
      <div
        className={cn("flex w-full items-start gap-2 md:gap-3", {
          "justify-end": role === "user" && mode !== "edit",
          "justify-start": role === "assistant" || role === "tool",
        })}
      >
        {message.role === "assistant" && (
          <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
            <SparklesIcon size={14} />
          </div>
        )}

        <div
          className={cn("flex flex-col", {
            "gap-2 md:gap-4": message.parts?.some(
              (p) =>
                p.type === "text" &&
                p.text?.trim() &&
                !parseSubAgentHandoffMarker(p.text)
            ),
            "w-full":
              (message.role === "assistant" &&
                (message.parts?.some(
                  (p) =>
                    p.type === "text" &&
                    p.text?.trim() &&
                    !parseSubAgentHandoffMarker(p.text)
                ) ||
                  message.parts?.some((p) => p.type.startsWith("tool-")))) ||
              mode === "edit",
            "max-w-[calc(100%-2.5rem)] sm:max-w-[min(fit-content,80%)]":
              message.role === "user" && mode !== "edit",
          })}
        >
          {attachmentsFromMessage.length > 0 && (
            <div
              className="flex flex-row justify-end gap-2"
              data-testid={"message-attachments"}
            >
              {attachmentsFromMessage.map((attachment) => (
                <PreviewAttachment
                  attachment={{
                    name: attachment.filename ?? "file",
                    contentType: attachment.mediaType,
                    url: attachment.url,
                  }}
                  key={attachment.url}
                />
              ))}
            </div>
          )}

          {message.parts?.map((part, index) => {
            if (!part || typeof part !== "object") {
              return null;
            }
            const { type } = part;
            const key = `message-${message.id}-part-${index}`;

            if (type === "reasoning") {
              const hasContent = part.text?.trim().length > 0;
              if (hasContent) {
                const isStreaming =
                  "state" in part && part.state === "streaming";
                return (
                  <MessageReasoning
                    isLoading={isLoading || isStreaming}
                    key={key}
                    reasoning={part.text}
                  />
                );
              }
            }

            if (type === "text") {
              const rawText = part.text ?? "";
              if (parseSubAgentHandoffMarker(rawText)) {
                return null;
              }
              const partEvent = parseEventMessage(rawText);
              const partAgent = parseAgentMessage(rawText);

              if (mode === "view") {
                return (
                  <div key={key}>
                    <MessageContent
                      className={cn({
                        "wrap-break-word w-fit rounded-2xl px-3 py-2 text-right bg-primary text-primary-foreground":
                          message.role === "user" && !partEvent && !partAgent,
                        "bg-transparent px-0 py-0 text-left w-full":
                          message.role === "assistant" ||
                          partEvent ||
                          partAgent,
                      })}
                      data-testid="message-content"
                    >
                      {partEvent ? (
                        <EventCard event={partEvent} />
                      ) : partAgent ? (
                        <AgentActionCard agent={partAgent} />
                      ) : (
                        <Response>{sanitizeText(rawText)}</Response>
                      )}
                    </MessageContent>
                  </div>
                );
              }

              if (mode === "edit") {
                return (
                  <div
                    className="flex w-full flex-row items-start gap-3"
                    key={key}
                  >
                    <div className="size-8" />
                    <div className="min-w-0 flex-1">
                      <MessageEditor
                        key={message.id}
                        message={message}
                        regenerate={regenerate}
                        setMessages={setMessages}
                        setMode={setMode}
                      />
                    </div>
                  </div>
                );
              }
            }

            if (type === "tool-getWeather") {
              const { toolCallId, state } = part;
              const approvalId = (part as { approval?: { id: string } })
                .approval?.id;
              const isDenied =
                state === "output-denied" ||
                (state === "approval-responded" &&
                  (part as { approval?: { approved?: boolean } }).approval
                    ?.approved === false);
              const widthClass = "w-[min(100%,450px)]";

              if (state === "output-available") {
                return (
                  <div className={widthClass} key={toolCallId}>
                    <Weather weatherAtLocation={part.output} />
                  </div>
                );
              }

              if (isDenied) {
                return (
                  <div className={widthClass} key={toolCallId}>
                    <Tool className="w-full" defaultOpen={true}>
                      <ToolHeader
                        state="output-denied"
                        type="tool-getWeather"
                      />
                      <ToolContent>
                        <div className="px-4 py-3 text-muted-foreground text-sm">
                          Weather lookup was denied.
                        </div>
                      </ToolContent>
                    </Tool>
                  </div>
                );
              }

              if (state === "approval-responded") {
                return (
                  <div className={widthClass} key={toolCallId}>
                    <Tool className="w-full" defaultOpen={true}>
                      <ToolHeader state={state} type="tool-getWeather" />
                      <ToolContent>
                        <ToolInput input={part.input} />
                      </ToolContent>
                    </Tool>
                  </div>
                );
              }

              return (
                <div className={widthClass} key={toolCallId}>
                  <Tool className="w-full" defaultOpen={true}>
                    <ToolHeader state={state} type="tool-getWeather" />
                    <ToolContent>
                      {(state === "input-available" ||
                        state === "approval-requested") && (
                        <ToolInput input={part.input} />
                      )}
                      {state === "approval-requested" && approvalId && (
                        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                          <button
                            className="rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
                            onClick={() => {
                              addToolApprovalResponse({
                                id: approvalId,
                                approved: false,
                                reason: "User denied weather lookup",
                              });
                            }}
                            type="button"
                          >
                            Deny
                          </button>
                          <button
                            className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm transition-colors hover:bg-primary/90"
                            onClick={() => {
                              addToolApprovalResponse({
                                id: approvalId,
                                approved: true,
                              });
                            }}
                            type="button"
                          >
                            Allow
                          </button>
                        </div>
                      )}
                    </ToolContent>
                  </Tool>
                </div>
              );
            }

            if (type === "tool-renderChart") {
              const { toolCallId, state } = part;
              const widthClass =
                "w-full max-w-full min-w-0 sm:max-w-[min(100%,720px)]";

              if (state === "output-available") {
                const out = part.output;
                if (
                  out &&
                  typeof out === "object" &&
                  "error" in out &&
                  out.error != null
                ) {
                  return (
                    <div
                      className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600 text-sm dark:bg-red-950/40 dark:text-red-400"
                      key={toolCallId}
                    >
                      {String((out as { error: unknown }).error)}
                    </div>
                  );
                }
                if (
                  out &&
                  typeof out === "object" &&
                  "chartType" in out &&
                  "labels" in out &&
                  "series" in out
                ) {
                  return (
                    <div className={widthClass} key={toolCallId}>
                      <ChartDisplay spec={out as ChartToolPayload} />
                    </div>
                  );
                }
                return (
                  <div className={widthClass} key={toolCallId}>
                    <p className="text-muted-foreground text-sm">
                      Chart data was invalid or incomplete.
                    </p>
                  </div>
                );
              }

              return (
                <div className={widthClass} key={toolCallId}>
                  <Tool
                    className="w-full"
                    defaultOpen={state !== "input-streaming"}
                  >
                    <ToolHeader state={state} type={type} />
                    <ToolContent>
                      {state === "input-available" && (
                        <ToolInput input={part.input} />
                      )}
                      {state === "output-error" && (
                        <div className="px-4 py-3 text-destructive text-sm">
                          Could not render the chart.
                        </div>
                      )}
                    </ToolContent>
                  </Tool>
                </div>
              );
            }

            if (type === "tool-createDocument") {
              const { toolCallId } = part;

              if (part.output && "error" in part.output) {
                return (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
                    key={toolCallId}
                  >
                    Error creating document: {String(part.output.error)}
                  </div>
                );
              }

              return (
                <DocumentPreview
                  isReadonly={isReadonly}
                  key={toolCallId}
                  result={part.output}
                />
              );
            }

            if (type === "tool-updateDocument") {
              const { toolCallId } = part;

              if (part.output && "error" in part.output) {
                return (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
                    key={toolCallId}
                  >
                    Error updating document: {String(part.output.error)}
                  </div>
                );
              }

              return (
                <div className="relative" key={toolCallId}>
                  <DocumentPreview
                    args={{ ...part.output, isUpdate: true }}
                    isReadonly={isReadonly}
                    result={part.output}
                  />
                </div>
              );
            }

            if (type === "tool-requestSuggestions") {
              const { toolCallId, state } = part;

              return (
                <Tool defaultOpen={true} key={toolCallId}>
                  <ToolHeader state={state} type="tool-requestSuggestions" />
                  <ToolContent>
                    {state === "input-available" && (
                      <ToolInput input={part.input} />
                    )}
                    {state === "output-available" && (
                      <ToolOutput
                        errorText={undefined}
                        output={
                          "error" in part.output ? (
                            <div className="rounded border p-2 text-red-500">
                              Error: {String(part.output.error)}
                            </div>
                          ) : (
                            <DocumentToolResult
                              isReadonly={isReadonly}
                              result={part.output}
                              type="request-suggestions"
                            />
                          )
                        }
                      />
                    )}
                  </ToolContent>
                </Tool>
              );
            }

            if (
              type.startsWith("tool-") &&
              "toolCallId" in part &&
              "state" in part
            ) {
              const { toolCallId, state } = part;

              // Only show error if output.error is a real non-null string
              const rawError =
                "output" in part &&
                part.output &&
                typeof part.output === "object" &&
                "error" in part.output &&
                (part.output as any).error != null
                  ? String((part.output as any).error)
                  : undefined;

              // If the tool has a redirect URL (like OAuth), surface it prominently
              const redirectUrl =
                "output" in part &&
                part.output &&
                typeof part.output === "object"
                  ? (part.output as any).url || (part.output as any).redirectUrl
                  : undefined;

              return (
                <div className="w-[min(100%,500px)]" key={toolCallId}>
                  <Tool
                    defaultOpen={
                      state === "approval-requested" || state === "output-error"
                    }
                  >
                    <ToolHeader state={state} type={type as any} />
                    <ToolContent>
                      {"input" in part && !!part.input && (
                        <ToolInput input={part.input} />
                      )}
                      {"output" in part && !!part.output && (
                        <>
                          {redirectUrl && (
                            <div className="px-4 pb-3">
                              <Button
                                asChild
                                className="w-full gap-2"
                                size="sm"
                              >
                                <Link href={redirectUrl} target="_blank">
                                  <ExternalLink className="size-4" />
                                  Connect Account
                                </Link>
                              </Button>
                            </div>
                          )}
                          <ToolOutput
                            errorText={rawError}
                            output={part.output as any}
                          />
                        </>
                      )}
                    </ToolContent>
                  </Tool>
                </div>
              );
            }

            return null;
          })}

          {!isReadonly && (
            <MessageActions
              chatId={chatId}
              isLoading={isLoading}
              key={`action-${message.id}`}
              message={message}
              setMode={setMode}
              vote={vote}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export const PreviewMessage = PurePreviewMessage;

export const ThinkingMessage = () => {
  return (
    <div
      className="group/message fade-in w-full animate-in duration-300"
      data-role="assistant"
      data-testid="message-assistant-loading"
    >
      <div className="flex items-start justify-start gap-3">
        <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
          <div className="animate-pulse">
            <SparklesIcon size={14} />
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 md:gap-4">
          <div className="flex items-center gap-1 p-0 text-muted-foreground text-sm">
            <span className="animate-pulse">Thinking</span>
            <span className="inline-flex">
              <span className="animate-bounce [animation-delay:0ms]">.</span>
              <span className="animate-bounce [animation-delay:150ms]">.</span>
              <span className="animate-bounce [animation-delay:300ms]">.</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
