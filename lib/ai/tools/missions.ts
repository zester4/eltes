import { tool } from "ai";
import { z } from "zod";
import { Client } from "@upstash/workflow";
import { createAgentTask } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";

function getMissionWorkflowClient(): Client | null {
  if (!process.env.QSTASH_TOKEN) return null;
  return new Client({ token: process.env.QSTASH_TOKEN });
}

export const launchMission = ({
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
      "Launch a multi-week autonomous mission to achieve a business goal. " +
      "Use this for goals like 'get us 50 beta users', 'find us 10 enterprise leads', " +
      "'launch on Product Hunt', 'grow our Twitter following', 'book 5 demo calls'. " +
      "The mission runs for 14 days autonomously — finding leads, running personalised " +
      "outreach sequences, posting content, engaging communities — and reports back daily.",
    inputSchema: z.object({
      goal: z
        .string()
        .describe(
          "The specific, measurable goal. e.g. 'Get 50 beta users who are SaaS founders'"
        ),
      startupDescription: z
        .string()
        .describe(
          "Describe your product, who it's for, and the core problem it solves. The more specific the better."
        ),
      productUrl: z.string().optional().describe("Your product URL if you have one"),
    }),
    execute: async ({ goal, startupDescription, productUrl }) => {
      if (!process.env.QSTASH_TOKEN) {
        return {
          success: false,
          error:
            "QSTASH_TOKEN not configured. Add it to your environment to enable missions.",
        };
      }

      const client = getMissionWorkflowClient();
      if (!client) {
        return { success: false, error: "Workflow client unavailable." };
      }

      const missionId = generateUUID();

      // The catch-all serveMany route — "mission-workflow" matches the key in serveMany
      const missionUrl = `${baseUrl}/api/agent/mission/mission-workflow`;

      try {
        const { workflowRunId } = await client.trigger({
          url: missionUrl,
          body: { missionId, userId, chatId, goal, startupDescription, productUrl },
          retries: 3,
        });

        // Track in DB so getMissionStatus can find it
        await createAgentTask({
          id: missionId,
          userId,
          chatId,
          agentType: "mission",
          task: goal,
        });

        return {
          success: true,
          missionId,
          workflowRunId,
          message: `Mission launched! Planning your 14-day campaign for "${goal}" now. You'll see the full plan in seconds. I'll check in daily with progress reports — no action needed from you until I flag something.`,
        };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return { success: false, error: `Failed to trigger mission workflow: ${msg}` };
      }
    },
  });

export const getMissionStatus = ({ userId: _userId }: { userId: string }) =>
  tool({
    description:
      "Get the status of an active mission or campaign. Use when the user asks " +
      "'how is the mission going', 'what happened with my campaign', 'any replies from leads'.",
    inputSchema: z.object({
      workflowRunId: z
        .string()
        .optional()
        .describe("The workflowRunId returned by launchMission. If omitted, checks the most recent."),
    }),
    execute: async ({ workflowRunId }) => {
      const client = getMissionWorkflowClient();
      if (!client) {
        return {
          status: "unknown",
          message: "Workflow client unavailable. Check QSTASH_TOKEN.",
        };
      }

      try {
        // Use `as any` because WorkflowRunLog type definitions vary across SDK versions
        const logsResult = workflowRunId
          ? await (client as any).logs({ workflowRunId })
          : await (client as any).logs();

        const runs: unknown[] = (logsResult as any)?.runs ?? [];

        if (!runs.length) {
          return {
            status: "not_found",
            message: "No workflow runs found. The mission may still be starting up.",
          };
        }

        const run = runs[0] as Record<string, unknown>;
        const state = (run.state ?? run.status ?? "running") as string;
        const stepCount = Array.isArray(run.steps) ? run.steps.length : 0;

        return {
          status: state,
          stepCount,
          workflowRunId: run.workflowRunId ?? workflowRunId,
          message: `Mission is ${state}. ${stepCount} steps completed so far. Check chat history for daily reports.`,
        };
      } catch {
        return {
          status: "running",
          message:
            "Mission is running. Check chat history for daily progress reports. " +
            "The workflow posts updates directly to this chat every morning.",
        };
      }
    },
  });