/**
 * Multi-Agent Orchestrator Workflow
 * Route: POST /api/agent/orchestrate
 *
 * parallel: triggers all sub-agent workflows, waits on every completion together.
 * sequential: triggers one agent at a time; each later agent receives prior agents'
 * text outputs appended to its task (same durable workflow + notify pattern).
 *
 * Single-agent tasks are unchanged — use delegateToSubAgent from chat, not this route.
 *
 * File location: app/api/agent/orchestrate/route.ts
 */

import { serve } from "@upstash/workflow/nextjs";
import { generateText } from "ai";
import { getGoogleModel } from "@/lib/ai/providers";
import { updateAgentOrchestration, saveMessages } from "@/lib/db/queries";
import {
  triggerAgentWorkflow,
  type OrchestrateWorkflowPayload,
} from "@/lib/workflow/client";
import { generateUUID } from "@/lib/utils";

export const maxDuration = 300;

type AgentPayload = OrchestrateWorkflowPayload["agents"][number];

type AgentResultRow = {
  slug: string;
  taskId: string;
  eventData: unknown;
  timedOut: boolean;
};

export const { POST } = serve<OrchestrateWorkflowPayload>(async (context) => {
  const {
    orchestrationId,
    userId,
    chatId,
    goal,
    strategy,
    agents,
  } = context.requestPayload;

  await context.run("mark-running", async () => {
    await updateAgentOrchestration({
      id: orchestrationId,
      userId,
      status: "running",
    });
  });

  let agentResults: AgentResultRow[] = [];

  if (strategy === "parallel") {
    const agentTasks = await context.run("trigger-agents-parallel", async () => {
      const tasks: Array<{ slug: string; taskId: string; task: string }> = [];
      for (const agent of agents) {
        try {
          await triggerAgentWorkflow({
            taskId: agent.taskId,
            userId,
            chatId,
            agentType: agent.slug,
            task: agent.task,
            orchestrationId,
          });
        } catch (err) {
          console.error(`[Orchestrate] Failed to trigger ${agent.slug}:`, err);
        }
        tasks.push({ slug: agent.slug, taskId: agent.taskId, task: agent.task });
      }
      return tasks;
    });

    const settled = await Promise.all(
      agentTasks.map(async ({ slug, taskId }) => {
        const { eventData, timeout } = await context.waitForEvent(
          `wait-${slug}`,
          `orch-${orchestrationId}-${slug}-done`,
          { timeout: "2h" },
        );
        return { slug, taskId, eventData, timedOut: timeout };
      }),
    );
    agentResults = settled;
  } else {
    let priorOutputs = "";
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i] as AgentPayload;
      const enrichedTask =
        priorOutputs.length > 0
          ? `${agent.task}\n\n--- Prior agents' outputs (same orchestration) ---\n${priorOutputs}`
          : agent.task;

      await context.run(`trigger-seq-${i}-${agent.slug}`, async () => {
        await triggerAgentWorkflow({
          taskId: agent.taskId,
          userId,
          chatId,
          agentType: agent.slug,
          task: enrichedTask,
          orchestrationId,
        });
      });

      const { eventData, timeout } = await context.waitForEvent(
        `wait-seq-${i}-${agent.slug}`,
        `orch-${orchestrationId}-${agent.slug}-done`,
        { timeout: "2h" },
      );

      agentResults.push({
        slug: agent.slug,
        taskId: agent.taskId,
        eventData,
        timedOut: timeout,
      });

      if (!timeout) {
        const data = eventData as {
          success?: boolean;
          text?: string;
        } | null;
        const block = data?.text ?? "(no output)";
        priorOutputs += `\n## ${agent.slug}\n${block}`;
      }
    }
  }

  const synthesis = await context.run("synthesize", async () => {
    const successfulResults = agentResults
      .filter((r) => !r.timedOut)
      .map((r) => {
        const data = r.eventData as {
          success?: boolean;
          text?: string;
          taskId?: string;
        } | null;
        return `## ${r.slug}\n${data?.text ?? "(no output)"}`;
      })
      .join("\n\n---\n\n");

    const timedOut = agentResults.filter((r) => r.timedOut).map((r) => r.slug);

    if (!successfulResults) {
      return {
        text: `All ${agentResults.length} agents timed out or failed to complete.`,
        timedOut,
      };
    }

    const { text } = await generateText({
      model: getGoogleModel("gemini-2.5-flash"),
      system: `You are synthesizing the outputs of ${agentResults.length} specialized AI agents that all worked toward one goal. Produce a clear, structured executive summary. Highlight key findings, decisions taken, and next steps. Be concise — this goes directly into the user's chat.`,
      prompt: `Goal: ${goal}\n\nAgent Outputs:\n\n${successfulResults}${
        timedOut.length > 0
          ? `\n\nNote: The following agents timed out: ${timedOut.join(", ")}`
          : ""
      }`,
    });

    return { text, timedOut };
  });

  await context.run("save-result", async () => {
    const timestamp = new Date();

    await saveMessages({
      messages: [
        {
          id: generateUUID(),
          chatId,
          role: "assistant",
          parts: [
            {
              type: "text",
              text: `## Multi-Agent Orchestration Complete\n\n**Goal:** ${goal}\n**Strategy:** ${strategy} | **Agents:** ${agents.length}\n\n${synthesis.text}`,
            },
          ],
          attachments: [],
          createdAt: timestamp,
        },
      ],
    });

    await updateAgentOrchestration({
      id: orchestrationId,
      userId,
      status: "completed",
      result: { synthesis: synthesis.text, agentCount: agents.length },
    });
  });
});
