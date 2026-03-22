"use client";

import { useState } from "react";
import { Bot, ChevronDown, Loader2, CheckCircle, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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

export type AgentActionData = AgentDelegatedData | (AgentResultData & { result?: string; error?: string });

function isDelegated(data: AgentActionData): data is AgentDelegatedData {
  return "status" in data && !("result" in data) && !("error" in data);
}

function isResult(data: AgentActionData): data is AgentResultData {
  return "result" in data || "error" in data;
}

export const parseAgentDelegatedMessage = (text: string): AgentDelegatedData | null => {
  if (!text.startsWith("###AGENT_DELEGATED###")) return null;
  try {
    return JSON.parse(text.replace("###AGENT_DELEGATED###", ""));
  } catch {
    return null;
  }
};

export const parseAgentResultMessage = (text: string): AgentResultData | null => {
  if (!text.startsWith("###AGENT_RESULT###")) return null;
  try {
    return JSON.parse(text.replace("###AGENT_RESULT###", ""));
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

  const delegated = isDelegated(agent);
  const hasError = isResult(agent) && (agent as AgentResultData).error;

  const taskId =
    "taskId" in agent && typeof agent.taskId === "string"
      ? agent.taskId
      : undefined;

  return (
    <div
      className="not-prose my-4 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl transition-all hover:bg-white/[0.05]"
      data-agent-task-id={taskId}
    >
      <div
        className="flex cursor-pointer items-center gap-4 p-4 select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/40 shadow-inner">
          <Bot size={20} className="text-primary" />
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
                delegated
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  : hasError
                    ? "border-red-500/30 bg-red-500/10 text-red-400"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              )}
            >
              {delegated ? (
                <>
                  <Loader2 size={10} className="animate-spin mr-0.5" />
                  RUNNING
                </>
              ) : hasError ? (
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
            "flex size-7 items-center justify-center rounded-full bg-white/5 text-zinc-500 transition-all",
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
            <div className="p-4 space-y-3">
              {isResult(agent) && (agent.result || agent.error) && (
                <div className="rounded-xl border border-white/5 bg-[#080808] p-4 text-[14px] text-zinc-300 overflow-x-auto">
                  {agent.error ? (
                    <span className="text-red-400 font-mono text-[12px] whitespace-pre-wrap">{agent.error}</span>
                  ) : (
                    <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-white/5 prose-pre:border border-white/10">
                      <Response>{agent.result!}</Response>
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
