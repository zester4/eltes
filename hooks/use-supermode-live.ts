"use client";

import useSWR from "swr";

export type SupermodeLiveSession = {
  id: string;
  chatId: string;
  objective: string;
  status: string;
  currentStep: number;
  maxSteps: number;
};

export type SupermodeLiveAction = {
  id: string;
  stepIndex: number;
  actionType: string;
  toolName: string | null;
  summary: string | null;
  createdAt: string;
};

async function fetchSupermodeLiveBundle(
  chatId: string,
): Promise<{ session: SupermodeLiveSession; actions: SupermodeLiveAction[] } | null> {
  const activeRes = await fetch("/api/supermode/sessions?active=1");
  if (!activeRes.ok) {
    return null;
  }
  const activeJson = (await activeRes.json()) as {
    session: SupermodeLiveSession | null;
  };
  const session = activeJson.session;
  if (!session || session.chatId !== chatId) {
    return null;
  }

  const actionsRes = await fetch(
    `/api/supermode/sessions/${session.id}/action`,
  );
  if (!actionsRes.ok) {
    return { session, actions: [] };
  }
  const actionsJson = (await actionsRes.json()) as {
    actions?: SupermodeLiveAction[];
  };
  return {
    session,
    actions: actionsJson.actions ?? [],
  };
}

/**
 * Polls active SuperMode for this chat (same pattern as useActiveAgentTasks).
 */
export function useSupermodeLiveForChat(chatId: string | null) {
  const { data, error, isLoading } = useSWR(
    chatId ? (["supermode-live", chatId] as const) : null,
    ([, id]) => fetchSupermodeLiveBundle(id),
    { refreshInterval: 2500, revalidateOnFocus: true },
  );

  return {
    live: data,
    error,
    isLoading: Boolean(chatId) && isLoading && !data,
  };
}
