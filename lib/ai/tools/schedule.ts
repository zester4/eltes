//lib/ai/tools/schedule.ts
import { tool } from "ai";
import { Client } from "@upstash/qstash";
import { z } from "zod";
import { createAgentTask } from "@/lib/db/queries";

// Etles scheduling tools powered by QStash.
//
// The agent can:
// 1. setReminder   — publish a one-shot delayed message (e.g., "remind me in 2 hours")
// 2. setCronJob    — create a recurring schedule with a cron expression
// 3. listSchedules — list all active cron schedules for the user
// 4. deleteSchedule — delete a cron schedule by ID
//
// When a scheduled message fires, QStash POST-s to /api/scheduled with the payload.
// That endpoint handles delivering the reminder back to the user (e.g., via a notification
// or by creating a new chat message).

function getQStashClient() {
  return new Client({
    baseUrl: process.env.QSTASH_URL || "https://qstash-us-east-1.upstash.io",
    token: process.env.QSTASH_URL === "http://localhost:3000" ? "not-needed" : process.env.QSTASH_TOKEN!,
  });
}

// ─── setReminder ──────────────────────────────────────────────────────────────

export const setReminder = ({ userId, baseUrl }: { userId: string; baseUrl: string }) =>
  tool({
    description:
      "Set a one-time reminder or delayed action for the user. " +
      "Use this when the user says things like 'remind me in X minutes', " +
      "'follow up on this tomorrow', or 'check back in 2 hours'. " +
      "The reminder will fire after the specified delay and deliver a message back.",
    inputSchema: z.object({
      message: z
        .string()
        .describe(
          "The reminder content — what should Etles say when the reminder fires? e.g. 'Time to send the weekly report to the team.'"
        ),
      delaySeconds: z
        .number()
        .min(1)
        .describe(
          "How many seconds from now to wait before delivering the reminder. " +
          "Convert natural language durations: 1 hour = 3600, 1 day = 86400, 1 week = 604800."
        ),
      label: z
        .string()
        .optional()
        .describe("A short human-readable label to identify this reminder, e.g. 'weekly-report'"),
    }),
    execute: async ({ message, delaySeconds, label }) => {
      try {
        const client = getQStashClient();

        const result = await client.publishJSON({
          url: `${baseUrl}/api/scheduled`,
          body: {
            type: "reminder",
            userId,
            message,
            label: label ?? "reminder",
            scheduledAt: new Date().toISOString(),
          },
          delay: delaySeconds,
          retries: 3,
          label: label ?? "reminder",
        });
        
        // Log to AgentTask for dashboard visibility, but do not fail scheduling if this write fails.
        try {
          await createAgentTask({
            id: result.messageId, // Use QStash messageId as reference
            userId,
            chatId: "", // Reminders aren't bound to a chat until they fire
            agentType: "reminder",
            task: message,
          });
        } catch (taskError) {
          console.warn(
            "[schedule.setReminder] Reminder scheduled but AgentTask log failed:",
            taskError
          );
        }

        const fireAt = new Date(Date.now() + delaySeconds * 1000);
        return {
          success: true,
          messageId: result.messageId,
          message: `Reminder set! I'll remind you at ${fireAt.toLocaleString()}`,
          fireAt: fireAt.toISOString(),
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  });

// ─── setCronJob ───────────────────────────────────────────────────────────────

export const setCronJob = ({ userId, baseUrl }: { userId: string; baseUrl: string }) =>
  tool({
    description:
      "Create a recurring scheduled action using a cron expression. " +
      "Use this when the user wants something to happen regularly: " +
      "'every morning at 9am', 'every Monday', 'first of every month'. " +
      "Cron format: [minute] [hour] [day-of-month] [month] [day-of-week] (UTC timezone).",
    inputSchema: z.object({
      name: z
        .string()
        .describe(
          "A descriptive name for this schedule, e.g. 'daily-standup', 'weekly-report'. Used as deduplication ID."
        ),
      cron: z
        .string()
        .describe(
          "A valid cron expression in UTC. Examples: '0 9 * * *' (daily 9am UTC), '0 9 * * 1' (every Monday 9am), '0 8 1 * *' (1st of each month 8am)."
        ),
      message: z
        .string()
        .describe(
          "What action or message should trigger. e.g. 'Send the daily sales summary email via Gmail'"
        ),
    }),
    execute: async ({ name, cron, message }) => {
      try {
        const client = getQStashClient();

        const schedule = await client.schedules.create({
          destination: `${baseUrl}/api/scheduled`,
          cron,
          body: JSON.stringify({
            type: "cron",
            userId,
            name,
            message,
          }),
          headers: { "Content-Type": "application/json" },
          retries: 3,
          deduplicationId: `${userId}-${name}`,
        } as any);

        // Log to AgentTask for dashboard visibility, but do not fail cron creation if this write fails.
        try {
          await createAgentTask({
            id: schedule.scheduleId,
            userId,
            chatId: "",
            agentType: "cron",
            task: `${name}: ${message}`,
          });
        } catch (taskError) {
          console.warn(
            "[schedule.setCronJob] Cron scheduled but AgentTask log failed:",
            taskError
          );
        }

        return {
          success: true,
          scheduleId: schedule.scheduleId,
          message: `Recurring schedule created! "${name}" will run on: ${cron}`,
          cron,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  });

// ─── listSchedules ────────────────────────────────────────────────────────────

export const listSchedules = ({ userId }: { userId: string }) =>
  tool({
    description:
      "List all active recurring schedules (cron jobs) that have been set. " +
      "Use this when the user asks what reminders or scheduled tasks are active.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const client = getQStashClient();
        const all = await client.schedules.list();

        // Filter schedules that belong to this user by checking the body
        const userSchedules = all.filter((s) => {
          try {
            const body = JSON.parse(s.body ?? "{}");
            return body.userId === userId;
          } catch {
            return false;
          }
        });

        if (!userSchedules.length) {
          return { schedules: [], message: "No active schedules found." };
        }

        return {
          schedules: userSchedules.map((s) => {
            let parsed: any = {};
            try { parsed = JSON.parse(s.body ?? "{}"); } catch {}
            return {
              scheduleId: s.scheduleId,
              name: parsed.name ?? "unnamed",
              cron: s.cron,
              message: parsed.message,
              destination: s.destination,
            };
          }),
        };
      } catch (error: any) {
        return { schedules: [], error: error.message };
      }
    },
  });

// ─── deleteSchedule ───────────────────────────────────────────────────────────

export const deleteSchedule = () =>
  tool({
    description:
      "Delete a recurring cron schedule by its ID. " +
      "Use this when the user wants to cancel a scheduled task. " +
      "First use listSchedules to find the schedule ID.",
    inputSchema: z.object({
      scheduleId: z
        .string()
        .describe("The schedule ID to delete (from listSchedules output)."),
    }),
    execute: async ({ scheduleId }) => {
      try {
        const client = getQStashClient();
        await client.schedules.delete(scheduleId);
        return { success: true, message: `Schedule ${scheduleId} deleted.` };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  });
