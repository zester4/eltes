/**
 * lib/ai/tools/proactive.ts
 *
 * Tools that let the main Etles agent activate, configure, and inspect
 * the proactive background intelligence system.
 *
 * These are injected into the main chat route (not sub-agents).
 * Primary use: called by the onboarding_specialist after completing setup.
 *
 * Tools:
 *   activateHeartbeat     — starts the per-user QStash cron schedules
 *   getAgentSystemStatus  — shows heartbeat health, last run, next scheduled
 *   setMorningBriefingTime — changes the morning briefing hour preference
 */

import { tool } from "ai";
import { z } from "zod";
import { Redis } from "@upstash/redis";

function getRedis() {
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

// ── activateHeartbeat ─────────────────────────────────────────────────────────

export const activateHeartbeat = ({
  userId,
  baseUrl,
}: {
  userId: string;
  baseUrl: string;
}) =>
  tool({
    description:
      "Activate the proactive background intelligence system for this user. " +
      "This creates hourly heartbeat, weekly synthesis, and morning briefing schedules. " +
      "ALWAYS call this after the user completes onboarding (after saving 'onboarding_complete' memory). " +
      "Safe to call multiple times — uses deduplication so it won't create duplicates.",
    inputSchema: z.object({
      morningHour: z
        .number()
        .min(0)
        .max(23)
        .optional()
        .default(7)
        .describe(
          "UTC hour for the morning briefing (0-23). Default 7 = 7am UTC. " +
            "Adjust based on the user's timezone if known from memory.",
        ),
    }),
    execute: async ({ morningHour }) => {
      try {
        const res = await fetch(`${baseUrl}/api/agent/heartbeat/activate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Internal request — no auth cookie available here, so we call
            // the internal API with the delegate secret instead
            "x-agent-secret":
              process.env.AGENT_DELEGATE_SECRET ?? "dev-internal",
            "x-user-id": userId,
          },
          body: JSON.stringify({ morningHour }),
        });

        if (!res.ok) {
          const body = await res.text();
          return { success: false, error: `Activation failed (${res.status}): ${body}` };
        }

        const data = (await res.json()) as {
          ok: boolean;
          message: string;
          schedules: Record<string, string>;
        };

        return {
          success: data.ok,
          message: data.message,
          schedulesCreated: Object.keys(data.schedules ?? {}).filter((k) =>
            k.endsWith("ScheduleId"),
          ).length,
        };
      } catch (err: any) {
        return { success: false, error: err?.message ?? String(err) };
      }
    },
  });

// ── getAgentSystemStatus ──────────────────────────────────────────────────────

export const getAgentSystemStatus = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Show the health and status of all proactive background agent systems. " +
      "Use when the user asks 'is the heartbeat running?', 'are my agents active?', " +
      "'when did the system last run?', or to debug why no proactive messages are appearing.",
    inputSchema: z.object({}),
    execute: async () => {
      const redis = getRedis();
      if (!redis) {
        return {
          systems: [],
          error: "Redis not configured — cannot read agent status.",
        };
      }

      // Read all status keys in parallel
      const [heartbeat, synthesis, schedules] = await Promise.all([
        redis
          .get<{ lastRun: string; status: string }>(
            `agent:status:${userId}:heartbeat`,
          )
          .catch(() => null),
        redis
          .get<{ lastRun: string; status: string }>(
            `agent:status:${userId}:synthesis`,
          )
          .catch(() => null),
        redis
          .get<Record<string, string>>(`agent:heartbeat:schedules:${userId}`)
          .catch(() => null),
      ]);

      const systems = [
        {
          name: "Hourly Heartbeat",
          description: "Scans calendar, email, tasks for urgent items",
          lastRun: heartbeat?.lastRun ?? null,
          status: heartbeat?.status ?? "never_run",
          schedulesActive: !!schedules?.heartbeatScheduleId,
        },
        {
          name: "Weekly Synthesis",
          description: "Monday 8am UTC: generates weekly operating brief",
          lastRun: synthesis?.lastRun ?? null,
          status: synthesis?.status ?? "never_run",
          schedulesActive: !!schedules?.synthesisScheduleId,
        },
        {
          name: "Morning Briefing",
          description: `Daily at configured morning hour: focused day briefing`,
          lastRun: null,
          status: schedules?.morningScheduleId ? "scheduled" : "not_configured",
          schedulesActive: !!schedules?.morningScheduleId,
          cronTime: schedules?.morningCron ?? null,
        },
      ];

      const allActive = systems.every((s) => s.schedulesActive);
      const noneActive = systems.every((s) => !s.schedulesActive);

      return {
        systems,
        overallStatus: noneActive
          ? "INACTIVE — run activateHeartbeat to start proactive intelligence"
          : allActive
            ? "ACTIVE — all background systems running"
            : "PARTIAL — some systems not scheduled",
        workflowEnabled: Boolean(
          process.env.QSTASH_TOKEN && process.env.BASE_URL,
        ),
      };
    },
  });

// ── setMorningBriefingTime ────────────────────────────────────────────────────

export const setMorningBriefingTime = ({
  userId,
  baseUrl,
}: {
  userId: string;
  baseUrl: string;
}) =>
  tool({
    description:
      "Change the time the morning briefing fires. " +
      "Use when the user says 'wake me up at 6am' or 'send my brief at 8:30'. " +
      "Deletes the old morning schedule and creates a new one at the specified UTC hour.",
    inputSchema: z.object({
      morningHour: z
        .number()
        .min(0)
        .max(23)
        .describe(
          "UTC hour for morning briefing (0-23). " +
            "Convert from user's local time if their timezone is known from memory.",
        ),
      timezoneNote: z
        .string()
        .optional()
        .describe(
          "Optional note about the timezone conversion for the user's benefit.",
        ),
    }),
    execute: async ({ morningHour, timezoneNote }) => {
      try {
        // Re-activate with new morning hour — the activation API uses
        // deduplicationId which QStash will update with the new cron
        const res = await fetch(`${baseUrl}/api/agent/heartbeat/activate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-agent-secret":
              process.env.AGENT_DELEGATE_SECRET ?? "dev-internal",
            "x-user-id": userId,
          },
          body: JSON.stringify({ morningHour }),
        });

        if (!res.ok) {
          return {
            success: false,
            error: `Failed to update schedule (${res.status})`,
          };
        }

        const data = (await res.json()) as { ok: boolean; schedules: any };

        return {
          success: data.ok,
          morningHour,
          cronExpression: `0 ${morningHour} * * *`,
          message: `Morning briefing updated to ${morningHour}:00 UTC.${timezoneNote ? " " + timezoneNote : ""}`,
        };
      } catch (err: any) {
        return { success: false, error: err?.message ?? String(err) };
      }
    },
  });