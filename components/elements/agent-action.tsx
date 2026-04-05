"use client";

import { useMemo, useState } from "react";
import { Bot, ChevronDown, Loader2, CheckCircle, XCircle, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useActiveAgentTasks } from "@/hooks/use-active-agent-tasks";
import { Response } from "./response";

export type AgentDelegatedData = {
  agentType: string;
  slug: string;
  task: string;
  taskId: string;
  status: string;
  timestamp?: string;
};

export type AgentResultData = {
  agentType: string;
  slug: string;
  task: string;
  taskId: string;
  result?: string;
  error?: string;
  timestamp?: string;
};

export type AgentActionData = AgentDelegatedData | AgentResultData;

function isDelegated(data: AgentActionData): data is AgentDelegatedData {
  return "status" in data && !("result" in data) && !("error" in data);
}

export function isResult(data: AgentActionData): data is AgentResultData {
  return "result" in data || "error" in data;
}

export const parseAgentDelegatedMessage = (text: string): AgentDelegatedData | null => {
  const marker = "###AGENT_DELEGATED###";
  if (!text.startsWith(marker)) return null;

  try {
    const jsonStr = text.slice(marker.length);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
};

export const parseAgentResultMessage = (text: string): AgentResultData | null => {
  const marker = "###AGENT_RESULT###";
  if (!text.startsWith(marker)) return null;

  try {
    const jsonStr = text.slice(marker.length);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
};

export const parseAgentMessage = (text: string): AgentActionData | null => {
  const delegated = parseAgentDelegatedMessage(text);
  if (delegated) return delegated;
  const result = parseAgentResultMessage(text);
  if (result) return result;
  return null;
};

export const AgentActionCard = ({ agent }: { agent: AgentActionData }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { tasks } = useActiveAgentTasks();

  const taskId =
    "taskId" in agent && typeof agent.taskId === "string"
      ? agent.taskId
      : undefined;

  const delegated = isDelegated(agent);
  const hasError = isResult(agent) && (agent as AgentResultData).error;

  const status = useMemo(() => {
    if (!delegated) return hasError ? "failed" : "completed";
    const activeTask = tasks.find((t) => t.id === taskId);
    if (!activeTask) return "completed";
    return activeTask.status;
  }, [delegated, hasError, tasks, taskId]);

  return (
    <div
      className="not-prose my-2 w-full max-w-2xl overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-xl transition-all hover:bg-white/[0.05]"
      data-agent-task-id={taskId}
    >
      <div
        className="flex cursor-pointer items-center gap-3 p-3 select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/40 shadow-inner">
          <Bot size={16} className="text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-0.5">
            <h4 className="font-bold text-sm tracking-tight text-white/90">
              {agent.agentType}
            </h4>
            <Badge
              variant="outline"
              className={cn(
                "w-fit text-[9px] px-1.5 py-0 rounded-md font-medium tracking-wide font-mono",
                status === "running" || status === "pending"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  : status === "failed"
                    ? "border-red-500/30 bg-red-500/10 text-red-400"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              )}
            >
              {status === "running" || status === "pending" ? (
                <>
                  <Loader2 size={10} className="animate-spin mr-0.5" />
                  RUNNING
                </>
              ) : status === "failed" ? (
                <>
                  <XCircle size={10} className="mr-0.5" />
                  FAILED
                </>
              ) : (
                <>
                  <CheckCircle size={10} className="mr-0.5" />
                  COMPLETED
                </>
              )}
            </Badge>
          </div>
          <p className="text-[12px] text-zinc-400 mt-0.5 line-clamp-1">
            {agent.task}
          </p>
          {agent.timestamp && (
            <p className="text-[11px] text-zinc-500 mt-1">{agent.timestamp}</p>
          )}
        </div>

        <div
          className={cn(
            "flex size-6 items-center justify-center rounded-full bg-white/5 text-zinc-500 transition-all",
            isExpanded && "bg-primary/20 text-primary rotate-180"
          )}
        >
          <ChevronDown size={14} />
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden border-t border-white/5 bg-black/60"
          >
            <div className="p-3 space-y-2">
              {isResult(agent) && (agent.result || agent.error) && (
                <div className="rounded-lg border border-white/5 bg-[#080808] p-3 text-[14px] text-zinc-300 overflow-x-auto">
                  {agent.error ? (
                    <span className="text-red-400 font-mono text-[12px] whitespace-pre-wrap">{agent.error}</span>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {(() => {
                        const { text, imageUrl, videoUrl } = extractMediaAndText(agent.result!);
                        return (
                          <>
                            {imageUrl && <FeaturedImage url={imageUrl} />}
                            {videoUrl && <FeaturedVideo url={videoUrl} />}
                            <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-white/5 prose-pre:border border-white/10">
                              <Response>{text}</Response>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
              <div className="text-[10px] text-zinc-500 font-mono">
                Task ID: {agent.taskId}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const AgentMessageBubble = ({ agent }: { agent: AgentResultData }) => {
  return (
    <div className="not-prose my-2 w-full max-w-2xl overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] p-4 shadow-sm transition-all focus-within:ring-1 focus-within:ring-primary/20">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/60 shadow-inner">
          <Bot size={16} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-sm font-bold tracking-tight text-white/90">{agent.agentType}</span>
          <Badge
            variant="outline"
            className="w-fit text-[9px] px-1.5 py-0 rounded-md font-medium tracking-wide font-mono border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          >
            <CheckCircle size={10} className="mr-0.5" />
            COMPLETED
          </Badge>
        </div>
      </div>
      <div className="mt-2 border-t border-white/5 pt-3 w-full text-sm">
        {agent.error ? (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-[14px] text-red-400 font-mono text-[12px] whitespace-pre-wrap">
            {agent.error}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {(() => {
              const { text, imageUrl, videoUrl } = extractMediaAndText(agent.result!);
              return (
                <>
                  {imageUrl && <FeaturedImage url={imageUrl} />}
                  {videoUrl && <FeaturedVideo url={videoUrl} />}
                  <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-white/5 prose-pre:border border-white/10">
                    <Response>{text}</Response>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
      {agent.timestamp && (
        <div className="mt-3 text-[10px] text-zinc-500 font-mono">
          {new Date(agent.timestamp).toLocaleString()}
        </div>
      )}
    </div>
  );
};

// --- Utilities ---

const IMAGE_REGEX = /!\[.*?\]\((https?:\/\/.*?)\.(png|jpg|jpeg|webp)(?:\?.*)?\)/i;
const VIDEO_REGEX = /!\[.*?\]\((https?:\/\/.*?)\.(mp4|webm|quicktime|ogg)(?:\?.*)?\)/i;

function extractMediaAndText(rawText: string) {
  let text = rawText;
  let imageUrl: string | null = null;
  let videoUrl: string | null = null;

  const imageMatch = text.match(IMAGE_REGEX);
  if (imageMatch) {
    imageUrl = imageMatch[1] + "." + imageMatch[2];
    text = text.replace(imageMatch[0], "").trim();
  }

  const videoMatch = text.match(VIDEO_REGEX);
  if (videoMatch) {
    videoUrl = videoMatch[1] + "." + videoMatch[2];
    text = text.replace(videoMatch[0], "").trim();
  }

  return { text, imageUrl, videoUrl };
}

const FeaturedImage = ({ url }: { url: string }) => {
  const handleDownload = async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `etles-asset-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/40 ring-1 ring-white/5 shadow-2xl transition-all duration-500 hover:scale-[1.01] hover:ring-white/20">
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <img
        src={url}
        alt="Agent Generated Visual"
        className="block h-auto w-full max-w-full object-cover transition-transform duration-700 group-hover:scale-110"
        loading="lazy"
      />
      <div className="absolute bottom-3 left-3 flex items-center gap-2 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100 translate-y-2">
        <div className="rounded-full bg-black/60 backdrop-blur-md px-3 py-1 text-[10px] font-medium text-white/80 ring-1 ring-white/10 shadow-lg">
          Nano Banana Generated
        </div>
      </div>
      
      <button
        onClick={handleDownload}
        className="absolute bottom-3 right-3 flex size-8 items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-white/80 opacity-0 transition-all duration-500 hover:bg-primary/20 hover:text-white group-hover:translate-y-0 group-hover:opacity-100 translate-y-2 ring-1 ring-white/10 shadow-lg"
        title="Download Image"
      >
        <Download size={14} />
      </button>
    </div>
  );
};

const FeaturedVideo = ({ url }: { url: string }) => {
  const handleDownload = async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `etles-video-${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/40 ring-1 ring-white/5 shadow-2xl transition-all duration-500 hover:scale-[1.01] hover:ring-white/20">
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 z-10 pointer-events-none" />
      <video
        src={url}
        controls
        className="block w-full aspect-video object-cover transition-transform duration-700 group-hover:scale-[1.02]"
        poster={url + "#t=0.1"}
      />
      <div className="absolute top-3 left-3 flex items-center gap-2 z-20">
        <div className="rounded-full bg-indigo-500/80 backdrop-blur-md px-3 py-1 text-[10px] font-bold text-white shadow-lg ring-1 ring-white/20">
          Veo 3.1 Synthesis
        </div>
      </div>
      
      <button
        onClick={handleDownload}
        className="absolute bottom-3 right-3 z-30 flex size-9 items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-white/80 opacity-0 transition-all duration-500 hover:bg-indigo-500/20 hover:text-white group-hover:translate-y-0 group-hover:opacity-100 translate-y-2 ring-1 ring-white/10 shadow-lg"
        title="Download Video"
      >
        <Download size={16} />
      </button>
    </div>
  );
};
