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
import { isToolCall, isToolResult } from "@/lib/utils";
import { cn, sanitizeText } from "@/lib/utils";
import { useDataStream } from "./data-stream-provider";
import { DocumentToolResult } from "./document";
import { DocumentPreview } from "./document-preview";
import { AgentActionCard, AgentActionData, AgentMessageBubble, isResult, parseAgentMessage, type AgentResultData } from "./elements/agent-action";
import { ChartDisplay } from "./elements/chart-display";
import { EventCard, parseEventMessage } from "./elements/event";
import { ExpandableContent } from "./elements/expandable-content";
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
import { ImageEditor } from "./image-editor";
import { Button } from "./ui/button";
import { Weather } from "./weather";
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from "./ai-elements/confirmation";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Pencil } from "lucide-react";
import { Video } from "./ai-elements/video";

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

  const hasAgentResult = message.parts.some((part: any) => {
    if (part.type === "text" && part.text) {
      const parsed = parseAgentMessage(part.text);
      return parsed && isResult(parsed) && !parsed.error;
    }
    return false;
  });

  return (
    <div
      className="group/message fade-in w-full animate-in duration-150"
      data-role={message.role}
      data-testid={`message-${message.role}`}
    >
      <div
        className={cn("flex w-full items-start gap-1.5 md:gap-2", {
          "justify-end": role === "user" && mode !== "edit",
          "justify-start": role === "assistant" || role === "tool",
        })}
      >
        {/* {message.role === "assistant" && !hasAgentResult && (
          <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
            <SparklesIcon size={14} />
          </div>
        )} */}

        <div
          className={cn("flex flex-col", {
            "ml-11": message.role === "assistant" && hasAgentResult,
            "gap-1.5 md:gap-3": message.parts?.some(
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
            "items-end": message.role === "user" && mode !== "edit",
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

            const isConsecutiveTool =
              index > 0 &&
              (isToolCall(message.parts[index - 1]) ||
                isToolResult(message.parts[index - 1])) &&
              (isToolCall(part) || isToolResult(part));

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

              let conversationalText = rawText;
              let partAgent: AgentActionData | null = null;
              let partEvent: any = null;

              if (rawText.includes("###AGENT_DELEGATED###")) {
                const [prefix, ...rest] = rawText.split("###AGENT_DELEGATED###");
                conversationalText = prefix;
                try { partAgent = JSON.parse(rest.join("###AGENT_DELEGATED###")); } catch {}
              } else if (rawText.includes("###AGENT_RESULT###")) {
                const [prefix, ...rest] = rawText.split("###AGENT_RESULT###");
                conversationalText = prefix;
                try { partAgent = JSON.parse(rest.join("###AGENT_RESULT###")); } catch {}
              } else if (rawText.includes("###EVENT###")) {
                const [prefix, ...rest] = rawText.split("###EVENT###");
                conversationalText = prefix;
                try { partEvent = JSON.parse(rest.join("###EVENT###")); } catch {}
              } else {
                partAgent = parseAgentMessage(rawText);
                if (!partAgent) {
                  partEvent = parseEventMessage(rawText);
                }
                if (partAgent || partEvent) {
                  conversationalText = "";
                }
              }

              return (
                <div key={key} className="flex flex-col gap-3 w-full">
                  {conversationalText.trim() && (
                    <MessageContent
                      className={cn({
                        "wrap-break-word w-fit max-w-[90%] rounded-2xl px-2.5 py-2 text-left bg-zinc-800 text-zinc-100 text-[13px] leading-relaxed border border-white/[0.05] shadow-sm ml-auto":
                          message.role === "user",
                        "bg-transparent px-0 py-0 text-left w-full text-[13px]":
                          message.role === "assistant",
                      })}
                      data-testid="message-content"
                    >
                      {message.role === "user" ? (
                        <ExpandableContent>
                          <div className="whitespace-pre-wrap">{conversationalText}</div>
                        </ExpandableContent>
                      ) : (
                        <Response>{conversationalText}</Response>
                      )}
                    </MessageContent>
                  )}

                  {(partEvent || partAgent) && (
                    <MessageContent
                      className="bg-transparent px-0 py-0 text-left w-full text-[13px]"
                      data-testid="message-content-cards"
                    >
                      {partEvent ? (
                        <EventCard event={partEvent} />
                      ) : partAgent ? (
                        isResult(partAgent) && !(partAgent as AgentResultData).error ? (
                          <AgentMessageBubble agent={partAgent as AgentResultData} />
                        ) : (
                          <AgentActionCard agent={partAgent} />
                        )
                      ) : null}
                    </MessageContent>
                  )}
                </div>
              );
            }

            if ((type as string) === "imageDelta") {
              return (
                <div className="flex w-full flex-col gap-2" key={key}>
                  <div className="overflow-hidden rounded-lg border border-border bg-muted/50">
                    <ImageEditor
                      content={(part as any).data}
                      currentVersionIndex={0}
                      isCurrentVersion={true}
                      isInline={true}
                      status={(part as any).data ? "idle" : "streaming"}
                      title="Generated Image"
                    />
                  </div>
                </div>
              );
            }

            if (mode === "edit") {
              return (
                <div className="flex w-full flex-row items-start justify-end gap-3" key={key}>
                  <div className="min-w-0 flex-1 md:max-w-[80%]">
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
                      
                      <Confirmation
                        className="mx-4 mb-4"
                        state={state}
                        approval={{ id: approvalId! }}
                      >
                        <ConfirmationRequest>
                          <ConfirmationTitle>
                            Approve checking the weather for {part.input?.city || `${part.input?.latitude}, ${part.input?.longitude}`}?
                          </ConfirmationTitle>
                          <ConfirmationActions>
                            <ConfirmationAction
                              variant="outline"
                              onClick={() => {
                                addToolApprovalResponse({
                                  id: approvalId!,
                                  approved: false,
                                  reason: "User denied weather lookup",
                                });
                              }}
                            >
                              Deny
                            </ConfirmationAction>
                            <ConfirmationAction
                              onClick={() => {
                                addToolApprovalResponse({
                                  id: approvalId!,
                                  approved: true,
                                });
                              }}
                            >
                              Allow
                            </ConfirmationAction>
                          </ConfirmationActions>
                        </ConfirmationRequest>

                        <ConfirmationAccepted>
                          <div className="flex items-center gap-2 text-emerald-500">
                            <CheckCircle2 className="size-4" />
                            <span className="text-sm font-medium">Weather lookup approved.</span>
                          </div>
                        </ConfirmationAccepted>

                        <ConfirmationRejected>
                          <div className="flex items-center gap-2 text-destructive">
                            <XCircle className="size-4" />
                            <span className="text-sm font-medium">Weather lookup denied.</span>
                          </div>
                        </ConfirmationRejected>
                      </Confirmation>
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

            if ((type as string) === "tool-generateImage") {
              const partAny = part as any;
              const { toolCallId, state } = partAny;
              const widthClass = "w-full max-w-full min-w-0 sm:max-w-[min(100%,720px)]";

              if (state === "output-available") {
                const out = partAny.output;
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
                
                if (out && typeof out === "object" && "url" in out && typeof out.url === "string") {
                  return (
                    <div className={widthClass} key={toolCallId}>
                      <img 
                        src={out.url} 
                        alt={(out as any).originalPrompt || "Generated Image"} 
                        className="rounded-lg border border-border bg-muted/50 max-h-[500px] object-contain shadow-sm"
                        loading="lazy"
                      />
                    </div>
                  );
                }

                // If no URL but no error, either it's incomplete or failing silently
                return null;
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
                        <ToolInput input={partAny.input} />
                      )}
                      {state === "output-error" && (
                        <div className="px-4 py-3 text-destructive text-sm">
                          Could not generate the image.
                        </div>
                      )}
                    </ToolContent>
                  </Tool>
                </div>
              );
            }

            if ((type as string) === "tool-generateVideo") {
              const partAny = part as any;
              const { toolCallId, state } = partAny;
              const widthClass = "w-full max-w-full min-w-0 sm:max-w-[min(100%,720px)]";

              if (state === "output-available") {
                const out = partAny.output;
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
                
                if (out && typeof out === "object" && "url" in out && typeof out.url === "string") {
                  return (
                    <div className={widthClass} key={toolCallId}>
                      <Video 
                        url={out.url} 
                        aspectRatio={out.aspectRatio === "9:16" ? "portrait" : "video"}
                      />
                    </div>
                  );
                }

                return null;
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
                        <ToolInput input={partAny.input} />
                      )}
                      {state === "output-error" && (
                        <div className="px-4 py-3 text-destructive text-sm">
                          Could not generate the video.
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

              // Special handling for queueApproval result
              if ((type as any) === "tool-queueApproval" && "output" in part && (part.output as any).status === "pending_approval") {
                const output = part.output as any;
                const draftId = output.draftId;
                
                return (
                  <div className="w-[min(100%,500px)]" key={toolCallId}>
                     <Tool defaultOpen={true}>
                        <ToolHeader state="output-available" type="tool-queueApproval" />
                        <ToolContent>
                           <div className="px-4 py-3 bg-muted/20 border-b border-border text-sm">
                              {output.message}
                           </div>
                           <Confirmation
                             className="mx-3 my-3"
                             state="approval-requested"
                             approval={{ id: draftId }}
                           >
                             <ConfirmationRequest>
                               <div className="flex flex-col gap-3">
                                 <ConfirmationActions className="flex-wrap justify-start sm:justify-end">
                                   <ConfirmationAction
                                     variant="outline"
                                     className="h-8 text-xs border-destructive/20 text-destructive hover:bg-destructive/5"
                                     onClick={async () => {
                                       const res = await fetch("/api/approval", {
                                         method: "POST",
                                         body: JSON.stringify({ draftId, action: "reject" }),
                                       });
                                       if (res.ok) {
                                         toast.success("Action rejected");
                                         // In a real app, we might want to refresh the chat or update local state
                                       }
                                     }}
                                   >
                                     <XCircle size={14} className="mr-1" />
                                     Reject
                                   </ConfirmationAction>

                                   <ConfirmationAction
                                     variant="outline"
                                     className="h-8 text-xs border-primary/20"
                                     onClick={() => {
                                        const editPrompt = window.prompt("What settings would you like to change?");
                                        if (editPrompt) {
                                          fetch("/api/approval", {
                                            method: "POST",
                                            body: JSON.stringify({ draftId, action: "edit", editPrompt }),
                                          }).then(() => {
                                            toast.success("Revision requested");
                                          });
                                        }
                                     }}
                                   >
                                     <Pencil size={14} className="mr-1" />
                                     Edit
                                   </ConfirmationAction>

                                   <ConfirmationAction
                                     className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                                     onClick={async () => {
                                       const res = await fetch("/api/approval", {
                                         method: "POST",
                                         body: JSON.stringify({ draftId, action: "approve" }),
                                       });
                                       if (res.ok) {
                                         toast.success("Action approved and executing...");
                                       } else {
                                         toast.error("Execution failed");
                                       }
                                     }}
                                   >
                                     <CheckCircle2 size={14} className="mr-1" />
                                     Approve
                                   </ConfirmationAction>
                                 </ConfirmationActions>
                               </div>
                             </ConfirmationRequest>
                           </Confirmation>
                        </ToolContent>
                     </Tool>
                  </div>
                );
              }

              const fallbackToolCallId = "toolCallId" in part ? (part.toolCallId as string) : "";
              const fallbackState = "state" in part ? (part.state as string) : "output-available";
              const actualToolCallId = toolCallId || fallbackToolCallId;
              const actualState = state || fallbackState;
              const approvalId = (part as any).approval?.id;

              return (
                <div
                  className={cn("w-[min(100%,500px)]", {
                    "-mt-2": isConsecutiveTool,
                  })}
                  key={actualToolCallId}
                >
                  <Tool
                    defaultOpen={
                      actualState === "approval-requested" || actualState === "output-error"
                    }
                  >
                    <ToolHeader state={actualState as any} type={type as any} />
                    <ToolContent>
                      {"input" in part && !!part.input && (
                        <ToolInput input={part.input} />
                      )}
                      
                      {actualState === "approval-requested" && approvalId && (
                        <Confirmation
                          className="mx-4 mb-4"
                          state={actualState as any}
                          approval={{ id: approvalId }}
                        >
                          <ConfirmationRequest>
                            <ConfirmationTitle>
                              Approve execution of {type}?
                            </ConfirmationTitle>
                            <ConfirmationActions>
                              <ConfirmationAction
                                variant="outline"
                                onClick={() => {
                                  addToolApprovalResponse({
                                    id: approvalId,
                                    approved: false,
                                  });
                                }}
                              >
                                Deny
                              </ConfirmationAction>
                              <ConfirmationAction
                                onClick={() => {
                                  addToolApprovalResponse({
                                    id: approvalId,
                                    approved: true,
                                  });
                                }}
                              >
                                Allow
                              </ConfirmationAction>
                            </ConfirmationActions>
                          </ConfirmationRequest>
                        </Confirmation>
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
            <div className="opacity-100 md:opacity-0 md:group-hover/message:opacity-100 group-focus-within/message:opacity-100 transition-opacity duration-150 mt-1 md:mt-1.5">
              <MessageActions
                chatId={chatId}
                isLoading={isLoading}
                key={`action-${message.id}`}
                message={message}
                setMode={setMode}
                vote={vote}
              />
            </div>
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
        {/* <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
          <div className="animate-pulse">
            <SparklesIcon size={14} />
          </div>
        </div> */}

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
