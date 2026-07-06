"use client";

import useSWR from "swr";

export type AgentTaskStatus = "pending" | "running" | "completed" | "failed";

export interface AgentTask {
  agentType: string;
  chatId: string;
  createdAt: string;
  id: string;
  result: { text?: string; error?: string } | null;
  status: AgentTaskStatus;
  task: string;
  updatedAt: string;
  userId: string;
}

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Failed to fetch agent tasks");
  }
  const data = await res.json();
  return data.tasks as AgentTask[];
}

export function useActiveAgentTasks(chatId?: string | null) {
  const url = chatId
    ? `/api/agent/tasks?chatId=${encodeURIComponent(chatId)}`
    : "/api/agent/tasks";
  const { data: tasks = [], mutate } = useSWR<AgentTask[]>(url, fetcher, {
    refreshInterval: 5000, // Poll every 5s when viewing a chat with active tasks
  });
  return { tasks, mutate };
}

export function useActiveAgentTasksByChat(enabled = true) {
  const { data: tasks = [], mutate } = useSWR<AgentTask[]>(
    enabled ? "/api/agent/tasks" : null,
    fetcher,
    { refreshInterval: 10_000 }
  );
  const chatIdsWithActiveTasks = new Set(
    tasks.map((t) => t.chatId).filter(Boolean)
  );
  return { tasks, chatIdsWithActiveTasks, mutate };
}
