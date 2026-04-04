import { tool } from "ai";
import { z } from "zod";
import {
  getAllAgentSlugs,
  getSubAgentBySlug,
  SUBAGENT_DEFINITIONS,
} from "@/lib/agent/subagent-definitions";
import { runSubAgent } from "@/lib/agent/subagent-runner";
import {
  createAgentTask,
  getAgentTaskById,
  saveMessages,
  updateAgentTask,
} from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";
import { isWorkflowEnabled, triggerAgentWorkflow } from "@/lib/workflow/client";

function normalizeDelegateBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

async function invokeDelegateHttp(
  baseUrl: string,
  taskId: string,
  secret: string
): Promise<{ ok: boolean; status: number; body: string }> {
  const delegateUrl = `${normalizeDelegateBaseUrl(baseUrl)}/api/agent/delegate`;
  const res = await fetch(delegateUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-secret": secret,
    },
    body: JSON.stringify({ taskId }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

export const listSubAgents = () =>
  tool({
    description:
      "List all available sub-agents that Etles can delegate tasks to. " +
      "Use this when the user asks what agents exist or what can be delegated.",
    inputSchema: z.object({}),
    execute: () => {
      const agents = SUBAGENT_DEFINITIONS.map((a) => ({
        slug: a.slug,
        name: a.name,
        description: a.description,
      }));
      return {
        agents,
        message: `Available agents: ${agents.map((a) => a.name).join(", ")}. Use delegateToSubAgent to spawn one.`,
      };
    },
  });

export const delegateToSubAgent = ({
  userId,
  chatId,
  baseUrl,
}: {
  userId: string;
  chatId: string;
  baseUrl: string;
}) =>
  tool({
    description:
      "Delegate a task to a specialized sub-agent. Use when the user says things like " +
      "'handle my inbox', 'run outbound', 'find me leads', 'give me my brief', 'manage this project', " +
      "'post this', 'hire a developer', 'chase overdue invoices', 'what's happening with competitors', " +
      "'handle support', 'book my dentist', 'review this PR', 'optimize cloud costs', etc. " +
      "First use listSubAgents to see available agents. Pass the agent slug (e.g. inbox_operator, sdr) and the task description.",
    inputSchema: z.object({
      agentType: z
        .string()
        .describe(
          `Agent slug. One of: ${getAllAgentSlugs().join(", ")}. Use listSubAgents to see descriptions.`
        ),
      task: z
        .string()
        .describe(
          "The task to perform. Be specific, e.g. 'Find 20 SaaS founders who raised seed in the last 90 days' or 'Summarize my overnight emails and today's calendar'."
        ),
      attachments: z
        .array(z.string().url())
        .optional()
        .describe("Array of any file or image URLs the user provided that are necessary for the sub-agent to process"),
    }),
    execute: async ({ agentType, task, attachments }) => {
      const definition = getSubAgentBySlug(agentType);
      if (!definition) {
        return {
          success: false,
          error: `Unknown agent type: ${agentType}. Use listSubAgents to see available agents.`,
        };
      }

      const finalTask = attachments && attachments.length > 0 
        ? `${task}\n###ATTACHMENTS###\n${JSON.stringify(attachments)}` 
        : task;

      const taskId = generateUUID();
      await createAgentTask({
        id: taskId,
        userId,
        chatId,
        agentType,
        task: finalTask,
      });

      const delegationPayload = {
        agentType: definition.name,
        slug: agentType,
        task: task,
        taskId,
        status: "running",
        timestamp: new Date().toISOString(),
      };

      await saveMessages({
        messages: [
          {
            id: generateUUID(),
            chatId,
            role: "user",
            parts: [
              {
                type: "text",
                text: `###AGENT_DELEGATED###${JSON.stringify(delegationPayload)}`,
              },
            ],
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });

      const secret = process.env.AGENT_DELEGATE_SECRET ?? "dev-internal";

      // Prefer QStash Workflow when enabled — durable, retries, survives restarts
      if (isWorkflowEnabled()) {
        try {
          const workflowResult = await triggerAgentWorkflow({
            taskId,
            userId,
            chatId,
            agentType,
            task: finalTask,
          });
          if (workflowResult?.workflowRunId) {
            try {
              await updateAgentTask({
                id: taskId,
                userId,
                workflowRunId: workflowResult.workflowRunId,
              });
            } catch {
              // workflowRunId column may be missing — workflow still runs
            }
            return {
              success: true,
              taskId,
              message: `Delegated to ${definition.name} (durable workflow). Results will appear in the chat shortly. Use getSubAgentResult with taskId ${taskId} to check status.`,
            };
          }
        } catch {
          // Fall through to HTTP delegate / inline run
        }
      }

      let httpOk = false;
      try {
        const { ok, status, body } = await invokeDelegateHttp(
          baseUrl,
          taskId,
          secret
        );
        if (ok) {
          try {
            const parsed = JSON.parse(body) as {
              ok?: boolean;
              error?: string;
              message?: string;
            };
            if (parsed.ok === false) {
              return {
                success: false,
                taskId,
                message: `Agent run failed: ${parsed.message ?? parsed.error ?? "Unknown error"}`,
                error: parsed.error ?? parsed.message,
              };
            }
            httpOk = true;
          } catch {
            httpOk = true;
          }
        } else if (status === 401) {
          const runResult = await runSubAgent({
            taskId,
            userId,
            chatId,
            agentType,
            task: finalTask,
          });
          return {
            success: runResult.success,
            taskId,
            message: runResult.success
              ? `Delegated to ${definition.name} (ran inline — fix AGENT_DELEGATE_SECRET mismatch for async HTTP). ${runResult.text?.slice(0, 200) ?? "Done"}`
              : `Delegation failed (auth on /api/agent/delegate): ${runResult.error}`,
            error: runResult.error,
          };
        }
      } catch {
        httpOk = false;
      }

      if (!httpOk) {
        const runResult = await runSubAgent({
          taskId,
          userId,
          chatId,
          agentType,
          task: finalTask,
        });
        return {
          success: runResult.success,
          taskId,
          message: runResult.success
            ? `Delegated to ${definition.name} (ran inline). ${runResult.text?.slice(0, 280) ?? "Done"}`
            : `Delegation failed: ${runResult.error}`,
          error: runResult.error,
        };
      }

      return {
        success: true,
        taskId,
        message: `Delegated to ${definition.name}. The agent is running; results will appear in the chat shortly. Use getSubAgentResult with taskId ${taskId} to check status.`,
      };
    },
  });

export const getSubAgentResult = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Get the result of a delegated sub-agent task. Use when the user asks for the outcome of a delegation or to check task status.",
    inputSchema: z.object({
      taskId: z
        .string()
        .describe("The task ID returned by delegateToSubAgent."),
    }),
    execute: async ({ taskId }) => {
      const task = await getAgentTaskById({ id: taskId, userId });
      if (!task) {
        return { success: false, error: "Task not found." };
      }
      return {
        success: true,
        taskId,
        status: task.status,
        result: task.result,
        agentType: task.agentType,
        task: task.task,
      };
    },
  });
