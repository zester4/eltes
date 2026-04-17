/**
 * lib/agent/agent-bus.ts
 *
 * Agent-to-Agent (A2A) communication bus.
 *
 * Etles sub-agents run in isolated Upstash Workflow processes and cannot
 * natively communicate. This bus provides two primitives:
 *
 *   1. notifyParentAgent(parentEventId, result)
 *      Called by a child agent when it finishes. The parent workflow has
 *      called context.waitForEvent(parentEventId) and will resume.
 *
 *   2. publishAgentResult(coordinationId, taskId, result)
 *      For fan-out coordination: parent spawns N agents and collects results
 *      from a shared Redis hash keyed by coordinationId.
 *
 *   3. collectAgentResults(coordinationId, expectedCount, timeoutMs)
 *      Parent polls the Redis hash until all N results arrive or timeout.
 *
 * Usage in child sub-agent (via collaborate.ts tool):
 *   await notifyParentAgent("collab:xyz:task1", { success: true, text: "..." })
 *
 * Usage in parent coordinator workflow:
 *   const { eventData } = await context.waitForEvent("wait-child-1", "collab:xyz:task1", "10m")
 */

import { Redis } from "@upstash/redis";
import { notifyWorkflow } from "@/lib/workflow/client";

function getRedis(): Redis | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  )
    return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentResult = {
  taskId: string;
  agentType: string;
  success: boolean;
  text?: string;
  error?: string;
  completedAt: string;
};

export type CoordinationEntry = {
  expectedCount: number;
  results: Record<string, AgentResult>;
  createdAt: string;
};

// ── Redis key helpers ─────────────────────────────────────────────────────────

function coordinationKey(coordinationId: string): string {
  return `agent:coordination:${coordinationId}`;
}

// 10 minute TTL on coordination entries — after that the parent has timed out
const COORDINATION_TTL = 60 * 10;

// ── notifyParentAgent ─────────────────────────────────────────────────────────

/**
 * Notify a parent Upstash Workflow that a child agent has completed.
 * The parent must be waiting at: context.waitForEvent(stepId, parentEventId, ...)
 *
 * This also publishes to the Redis coordination hash for fan-out collectors.
 *
 * @param parentEventId  - "collab:{coordinationId}:{taskId}"
 * @param result         - The child agent's result
 * @param parentWorkflowRunId - Optional: parent workflowRunId for lookback
 */
export async function notifyParentAgent(
  parentEventId: string,
  result: AgentResult,
  parentWorkflowRunId?: string,
): Promise<void> {
  // 1. Notify the Upstash Workflow event (wakes the waiting parent step)
  try {
    await notifyWorkflow(
      parentEventId,
      result as unknown as Record<string, unknown>,
      parentWorkflowRunId,
    );
  } catch (err) {
    console.error("[AgentBus] Failed to notify workflow event:", err);
  }

  // 2. Also write to the Redis fan-out hash (for collectAgentResults polling)
  const parts = parentEventId.split(":");
  if (parts.length >= 3) {
    const coordinationId = parts[1];
    const taskId = parts[2];
    await publishAgentResult(coordinationId, taskId, result);
  }
}

// ── publishAgentResult ────────────────────────────────────────────────────────

/**
 * Write a child agent's result into the coordination hash.
 * Used for fan-out: the parent calls collectAgentResults() to gather all.
 */
export async function publishAgentResult(
  coordinationId: string,
  taskId: string,
  result: AgentResult,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const key = coordinationKey(coordinationId);
  try {
    await redis.hset(key, { [taskId]: JSON.stringify(result) });
    await redis.expire(key, COORDINATION_TTL);
  } catch (err) {
    console.error("[AgentBus] Failed to publish agent result:", err);
  }
}

// ── initCoordination ──────────────────────────────────────────────────────────

/**
 * Initialize a coordination entry before spawning child agents.
 * This stores the expected count so collectAgentResults knows when done.
 */
export async function initCoordination(
  coordinationId: string,
  expectedCount: number,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const key = coordinationKey(coordinationId);
  try {
    await redis.hset(key, {
      __meta: JSON.stringify({
        expectedCount,
        createdAt: new Date().toISOString(),
      }),
    });
    await redis.expire(key, COORDINATION_TTL);
  } catch (err) {
    console.error("[AgentBus] Failed to init coordination:", err);
  }
}

// ── collectAgentResults ───────────────────────────────────────────────────────

/**
 * Poll the Redis coordination hash until all expected results arrive or timeout.
 * Intended for use inside Upstash Workflow context.run() steps where the
 * parent needs to collect all child results before proceeding.
 *
 * @param coordinationId   - shared coordination ID
 * @param expectedTaskIds  - list of taskIds we expect results for
 * @param timeoutMs        - max wait time (default 8 minutes)
 * @param pollIntervalMs   - poll frequency (default 5 seconds)
 */
export async function collectAgentResults(
  coordinationId: string,
  expectedTaskIds: string[],
  timeoutMs = 8 * 60 * 1000,
  pollIntervalMs = 5000,
): Promise<{
  results: Record<string, AgentResult>;
  timedOut: boolean;
  receivedCount: number;
}> {
  const redis = getRedis();
  if (!redis) {
    return { results: {}, timedOut: false, receivedCount: 0 };
  }

  const key = coordinationKey(coordinationId);
  const deadline = Date.now() + timeoutMs;
  const collected: Record<string, AgentResult> = {};

  while (Date.now() < deadline) {
    const remaining = expectedTaskIds.filter((id) => !collected[id]);
    if (remaining.length === 0) break;

    const raw = await redis.hgetall(key).catch(() => null);
    if (raw) {
      for (const taskId of remaining) {
        const val = raw[taskId];
        if (val) {
          try {
            collected[taskId] = JSON.parse(val as string) as AgentResult;
          } catch {
            /* ignore malformed */
          }
        }
      }
    }

    if (Object.keys(collected).length >= expectedTaskIds.length) break;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  return {
    results: collected,
    timedOut: Date.now() >= deadline,
    receivedCount: Object.keys(collected).length,
  };
}

// ── getCoordinationStatus ─────────────────────────────────────────────────────

/**
 * Check how many results have arrived for a coordination ID.
 * Non-blocking — returns immediately with current state.
 */
export async function getCoordinationStatus(coordinationId: string): Promise<{
  received: number;
  expected: number | null;
  results: Record<string, AgentResult>;
}> {
  const redis = getRedis();
  if (!redis) return { received: 0, expected: null, results: {} };

  const key = coordinationKey(coordinationId);
  const raw = await redis.hgetall(key).catch(() => null);
  if (!raw) return { received: 0, expected: null, results: {} };

  const results: Record<string, AgentResult> = {};
  let expected: number | null = null;

  for (const [field, val] of Object.entries(raw)) {
    if (field === "__meta") {
      try {
        const meta = JSON.parse(val as string) as { expectedCount: number };
        expected = meta.expectedCount;
      } catch { /* ignore */ }
      continue;
    }
    try {
      results[field] = JSON.parse(val as string) as AgentResult;
    } catch { /* ignore */ }
  }

  return { received: Object.keys(results).length, expected, results };
}