/**
 * lib/ai/tools/collaborate.ts
 *
 * Agent-to-Agent (A2A) collaboration tools injected into sub-agents.
 * These tools let any sub-agent spawn other sub-agents and optionally
 * wait for their results — enabling true multi-agent collaboration.
 *
 * Pattern:
 *   1. Sub-agent A runs and decides it needs research from competitive_intel
 *   2. Sub-agent A calls spawnChildAgent({ agentType: "competitive_intel", task: "..." })
 *   3. competitive_intel runs in its own Upstash Workflow
 *   4. When competitive_intel finishes, it calls notifyParentAgent()
 *   5. Sub-agent A's workflow resumes with the result (if it used waitForChildAgents)
 *
 * For "fire and forget": just use spawnChildAgent, don't call waitForChildAgents.
 * For "spawn and collect": spawn multiple agents, then waitForChildAgents([...ids]).
 */

import { tool } from "ai";
import { z } from "zod";
import { generateUUID } from "@/lib/utils";
import { createAgentTask } from "@/lib/db/queries";
import {
  triggerAgentWorkflow,
  isWorkflowEnabled,
} from "@/lib/workflow/client";
import {
  initCoordination,
  collectAgentResults,
  getCoordinationStatus,
} from "@/lib/agent/agent-bus";

// ── spawnChildAgent ───────────────────────────────────────────────────────────

export const spawnChildAgent = ({
  userId,
  chatId,
  parentEventId,
  parentWorkflowRunId,
}: {
  userId: string;
  chatId: string;
  /** The parentEventId this child should notify on completion. Auto-generated if not passed. */
  parentEventId?: string;
  parentWorkflowRunId?: string;
}) =>
  tool({
    description:
      "Spawn another specialized sub-agent to handle a parallel or sequential task. " +
      "Use this when you realize a task is better handled by a different agent — " +
      "for example, the inbox_operator spots a sales lead and spawns the sdr agent, " +
      "or the chief_of_staff needs competitive data and spawns competitive_intel. " +
      "Returns a taskId and coordinationId you can use to collect the result later. " +
      "Do NOT use for your own primary task — only to delegate parts of it to specialists.",
    inputSchema: z.object({
      agentType: z
        .string()
        .describe(
          "The slug of the agent to spawn. Examples: sdr, competitive_intel, " +
            "inbox_operator, chief_of_staff, social_media, finance, brand_monitor.",
        ),
      task: z
        .string()
        .describe(
          "Specific task for the child agent. Be precise — include all context " +
            "the child needs since it won't have access to your conversation history.",
        ),
      coordinationId: z
        .string()
        .optional()
        .describe(
          "Shared coordination ID if you're spawning multiple agents in a fan-out pattern. " +
            "Use the same coordinationId across all sibling spawn calls to group their results.",
        ),
      waitForResult: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "If true, this tool will wait up to 8 minutes for the child to complete. " +
            "Only set to true for SEQUENTIAL workflows where you need the result before continuing. " +
            "For parallel fan-out, set false and use waitForChildAgents separately.",
        ),
    }),
    execute: async ({ agentType, task, coordinationId, waitForResult }) => {
      const taskId = generateUUID();
      const coordination = coordinationId ?? generateUUID();
      const childEventId = `collab:${coordination}:${taskId}`;

      try {
        // Create the DB task record
        await createAgentTask({
          id: taskId,
          userId,
          chatId,
          agentType,
          task,
        });

        if (!isWorkflowEnabled()) {
          return {
            success: false,
            error: "Workflow not configured (QSTASH_TOKEN missing). Cannot spawn child agents.",
            taskId,
          };
        }

        // Initialize coordination if this is the first spawn
        await initCoordination(coordination, 1);

        // Trigger child workflow with parentEventId for A2A notification
        const result = await triggerAgentWorkflow({
          taskId,
          userId,
          chatId,
          agentType,
          task,
          parentEventId: childEventId,
        });

        if (!result) {
          return {
            success: false,
            error: "Failed to trigger child agent workflow.",
            taskId,
          };
        }

        const baseResponse = {
          success: true,
          taskId,
          coordinationId: coordination,
          childEventId,
          agentType,
          workflowRunId: result.workflowRunId,
          message: `Spawned ${agentType} agent (task: ${taskId}). ` +
            `It will notify on event: ${childEventId} when done.`,
        };

        // Optionally wait for the result inline (sequential pattern)
        if (waitForResult) {
          const collected = await collectAgentResults(
            coordination,
            [taskId],
            8 * 60 * 1000,
            3000,
          );
          const childResult = collected.results[taskId];
          return {
            ...baseResponse,
            waited: true,
            timedOut: collected.timedOut,
            result: childResult ?? null,
          };
        }

        return baseResponse;
      } catch (err: any) {
        return { success: false, error: err?.message ?? String(err), taskId };
      }
    },
  });

// ── waitForChildAgents ────────────────────────────────────────────────────────

export const waitForChildAgents = () =>
  tool({
    description:
      "Wait for previously spawned child agents to complete and collect their results. " +
      "Use this after calling spawnChildAgent multiple times with the same coordinationId. " +
      "Blocks for up to 8 minutes polling for all results. " +
      "Example: spawn sdr + competitive_intel in parallel, then wait for both.",
    inputSchema: z.object({
      coordinationId: z
        .string()
        .describe("The coordinationId returned by spawnChildAgent calls."),
      taskIds: z
        .array(z.string())
        .describe("List of taskIds from previous spawnChildAgent calls to wait for."),
      timeoutMinutes: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .default(8)
        .describe("Max wait time in minutes. Default 8."),
    }),
    execute: async ({ coordinationId, taskIds, timeoutMinutes }) => {
      try {
        const { results, timedOut, receivedCount } = await collectAgentResults(
          coordinationId,
          taskIds,
          (timeoutMinutes ?? 8) * 60 * 1000,
          4000,
        );

        return {
          success: true,
          timedOut,
          receivedCount,
          expectedCount: taskIds.length,
          allReceived: receivedCount >= taskIds.length,
          results: Object.entries(results).reduce(
            (acc, [taskId, result]) => {
              acc[taskId] = {
                agentType: result.agentType,
                success: result.success,
                text: result.text,
                error: result.error,
              };
              return acc;
            },
            {} as Record<string, any>,
          ),
          summary:
            receivedCount >= taskIds.length
              ? `All ${taskIds.length} agents completed.`
              : timedOut
                ? `Timed out after ${timeoutMinutes}m. Got ${receivedCount}/${taskIds.length} results.`
                : `Got ${receivedCount}/${taskIds.length} results.`,
        };
      } catch (err: any) {
        return { success: false, error: err?.message ?? String(err) };
      }
    },
  });

// ── getCollaborationStatus ────────────────────────────────────────────────────

export const getCollaborationStatus = () =>
  tool({
    description:
      "Check how many child agents have completed for a coordination ID without waiting. " +
      "Useful for non-blocking status checks mid-workflow.",
    inputSchema: z.object({
      coordinationId: z.string().describe("The coordinationId to check."),
    }),
    execute: async ({ coordinationId }) => {
      try {
        const status = await getCoordinationStatus(coordinationId);
        return {
          success: true,
          ...status,
          complete:
            status.expected !== null &&
            status.received >= status.expected,
        };
      } catch (err: any) {
        return { success: false, error: err?.message ?? String(err) };
      }
    },
  });