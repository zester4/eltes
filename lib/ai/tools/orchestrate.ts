/**
 * orchestrateAgents — Multi-Agent Fan-Out Tool
 *
 * The main chat agent calls this when a complex goal benefits from multiple
 * specialized agents working in parallel or sequence. Each sub-agent runs
 * in a durable Upstash Workflow. The orchestrator workflow waits for all
 * agents to finish, synthesizes results, and posts the summary to chat.
 *
 * File location: lib/ai/tools/orchestrate.ts
 */

import { tool } from "ai";
import { z } from "zod";
import { getAllAgentSlugs } from "@/lib/agent/subagent-definitions";
import {
  createAgentTask,
  createAgentOrchestration,
  updateAgentOrchestration,
  saveMessages,
} from "@/lib/db/queries";
import {
  isWorkflowEnabled,
  triggerOrchestratorWorkflow,
} from "@/lib/workflow/client";
import { generateUUID } from "@/lib/utils";

const agentSlugs = getAllAgentSlugs();

export const orchestrateAgents = ({
  userId,
  chatId,
}: {
  userId: string;
  chatId: string;
}) =>
  tool({
    description:
      "Coordinate multiple specialized AI agents working together toward a single complex goal. " +
      "Use when a task clearly benefits from parallelism or specialization — for example: " +
      "'competitive analysis + social response' (competitive_intel + social_media), " +
      "'full sales campaign' (sdr + chief_of_staff + brand_monitor), " +
      "'product launch' (product_hunt_launcher + social_media + growth_hacker + community_manager). " +
      "Parallel strategy runs all agents simultaneously (best for independent tasks). " +
      "Sequential strategy runs one agent at a time; each later agent receives the prior agents' outputs appended to its task (best for dependent pipelines). " +
      "The orchestrator synthesizes all outputs into a unified briefing posted to this chat.",
    inputSchema: z.object({
      goal: z
        .string()
        .describe(
          "The specific, measurable goal all agents are working toward. Be precise.",
        ),
      agents: z
        .array(
          z.object({
            slug: z
              .enum(agentSlugs as [string, ...string[]])
              .describe("The agent slug to delegate to"),
            task: z
              .string()
              .describe(
                "The specific task for this agent within the overall goal. Be detailed — the agent only sees this task description.",
              ),
          }),
        )
        .min(2)
        .max(8)
        .describe("2–8 agents to coordinate"),
      strategy: z
        .enum(["parallel", "sequential"])
        .default("parallel")
        .describe(
          "parallel = all agents run simultaneously and independently. " +
            "sequential = each agent runs after the previous one completes.",
        ),
    }),

    execute: async ({ goal, agents, strategy }) => {
      const orchestrationId = generateUUID();

      // Pre-create all AgentTask records so each sub-agent has a tracked task.
      // The orchestrator workflow references these IDs.
      const agentsWithTaskIds = await Promise.all(
        agents.map(async (agent) => {
          const taskId = generateUUID();
          await createAgentTask({
            id: taskId,
            userId,
            chatId,
            agentType: agent.slug,
            task: agent.task,
          });
          return { ...agent, taskId };
        }),
      );

      // Create the orchestration record
      await createAgentOrchestration({
        id: orchestrationId,
        userId,
        chatId,
        goal,
        strategy,
        agentSlugs: agents.map((a) => a.slug),
      });

      // Save a delegation status card to the chat
      const delegationPayload = {
        orchestrationId,
        goal,
        strategy,
        agentCount: agents.length,
        agents: agents.map((a) => ({ slug: a.slug, task: a.task.slice(0, 80) })),
        status: "running",
        timestamp: new Date().toISOString(),
      };

      await saveMessages({
        messages: [
          {
            id: generateUUID(),
            chatId,
            role: "assistant",
            parts: [
              {
                type: "text",
                text: `###ORCHESTRATION_STARTED###${JSON.stringify(delegationPayload)}`,
              },
            ],
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });

      // Trigger the orchestrator workflow
      if (isWorkflowEnabled()) {
        try {
          const result = await triggerOrchestratorWorkflow({
            orchestrationId,
            userId,
            chatId,
            goal,
            strategy,
            agents: agentsWithTaskIds,
          });

          if (result?.workflowRunId) {
            await updateAgentOrchestration({
              id: orchestrationId,
              userId,
              workflowRunId: result.workflowRunId,
            });

            return {
              success: true,
              orchestrationId,
              workflowRunId: result.workflowRunId,
              message: `Orchestration started. ${agents.length} agents are now running in ${strategy} mode toward: "${goal}". Results will appear in this chat when all agents finish. Estimated time: ${strategy === "parallel" ? "as fast as the slowest agent" : "sum of all agent times"}.`,
            };
          }
        } catch (err) {
          console.error("[orchestrateAgents] Workflow trigger failed:", err);
        }
      }

      // Fallback: mark as failed if workflow isn't enabled
      await updateAgentOrchestration({
        id: orchestrationId,
        userId,
        status: "failed",
        result: { error: "Upstash Workflow not configured (QSTASH_TOKEN missing)" },
      });

      return {
        success: false,
        orchestrationId,
        message:
          "Multi-agent orchestration requires Upstash Workflow (QSTASH_TOKEN). " +
          "Please configure it to use this feature. Each agent can still be delegated individually using delegateToSubAgent.",
      };
    },
  });