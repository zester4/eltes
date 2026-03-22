const PREFIX = "###SUB_AGENT_HANDOFF###";

export type SubAgentHandoffMarker = {
  taskId: string;
  at?: string;
};

export function buildSubAgentHandoffMarker(taskId: string): string {
  const payload: SubAgentHandoffMarker = {
    taskId,
    at: new Date().toISOString(),
  };
  return `${PREFIX}${JSON.stringify(payload)}`;
}

export function parseSubAgentHandoffMarker(
  text: string,
): SubAgentHandoffMarker | null {
  if (!text.startsWith(PREFIX)) {
    return null;
  }
  try {
    return JSON.parse(text.slice(PREFIX.length)) as SubAgentHandoffMarker;
  } catch {
    return null;
  }
}

export function messagePartsContainHandoffForTask(
  parts: unknown,
  taskId: string,
): boolean {
  if (!Array.isArray(parts)) {
    return false;
  }
  for (const p of parts) {
    if (
      p &&
      typeof p === "object" &&
      "type" in p &&
      (p as { type: string }).type === "text" &&
      "text" in p &&
      typeof (p as { text: unknown }).text === "string"
    ) {
      const marker = parseSubAgentHandoffMarker((p as { text: string }).text);
      if (marker?.taskId === taskId) {
        return true;
      }
    }
  }
  return false;
}
