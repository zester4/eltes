"use server";

import { auth } from "@/app/(auth)/auth";
import { Redis } from "@upstash/redis";
import { Index } from "@upstash/vector";
import { getRecentAgentTasksByUserId, getUserBotIntegrations } from "../queries";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

export type AgentStatusData = {
  heartbeat: {
    status: "active" | "inactive" | "error";
    lastRun?: string;
    nextRun?: string;
  };
  synthesis: {
    lastBrief?: string;
    savedAt?: string;
  };
  cronJobs: {
    id: string;
    task: string;
    status: string;
    createdAt: Date;
    cron?: string;
    nextRun?: string;
  }[];
  integrations: {
    platform: string;
    isConnected: boolean;
  }[];
};

export async function getAgentStatus(): Promise<AgentStatusData> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;

  // 1. Fetch synthesis from Vector
  let synthesisData: { lastBrief?: string; savedAt?: string } = {};
  try {
    const index = new Index({
      url: process.env.UPSTASH_VECTOR_REST_URL!,
      token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
    });
    const ns = index.namespace(`memory-${userId}`);
    const results = await ns.fetch(["weekly_synthesis"], { includeMetadata: true });
    if (results && results.length > 0 && results[0]) {
      const m = results[0].metadata as any;
      synthesisData = {
        lastBrief: m?.content,
        savedAt: m?.savedAt,
      };
    }
  } catch (e) {
    console.error("Failed to fetch synthesis:", e);
  }

  // 2. Fetch cron jobs (active tasks) from DB
  const recentTasks = await getRecentAgentTasksByUserId(userId, 5);
  const cronJobs = recentTasks.map(t => ({
    id: t.id,
    task: t.task,
    status: t.status,
    createdAt: t.createdAt,
  }));

  // 3. Fetch integrations
  const integrations = await getUserBotIntegrations({ userId });
  const integrationStatus = integrations.map(i => ({
    platform: i.platform,
    isConnected: true,
  }));

  // 4. Scheduled Jobs: Check QStash schedules directly
  let heartbeatStatus: AgentStatusData["heartbeat"] = {
    status: "inactive",
  };
  const activeCronJobs: AgentStatusData["cronJobs"] = [];

  const qstashToken = process.env.QSTASH_TOKEN;
  const qstashUrl = process.env.QSTASH_URL || "https://qstash.upstash.io";
  
  if (qstashToken) {
    try {
      const response = await fetch(`${qstashUrl}/v2/schedules`, {
        headers: {
          Authorization: `Bearer ${qstashToken}`,
        },
      });
      if (response.ok) {
        const schedules = await response.json() as any[];
        
        for (const s of schedules) {
          try {
            const body = JSON.parse(s.body || "{}");
            if (body.userId !== userId) continue;

            if (!body.type || body.type === "heartbeat") {
              heartbeatStatus = {
                status: "active",
                nextRun: new Date(s.nextRun * 1000).toISOString(),
              };
            } else if (body.type === "cron") {
              activeCronJobs.push({
                id: s.scheduleId,
                task: body.name || "Unnamed Job",
                status: "active",
                createdAt: new Date(s.createdAt * 1000),
                cron: s.cron,
                nextRun: new Date(s.nextRun * 1000).toISOString(),
              });
            }
          } catch (err) {
            console.error("Failed to parse schedule body:", err);
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch QStash schedules:", e);
      heartbeatStatus.status = "error";
    }
  }

  // Merge with recent agent tasks from DB (keeping them distinct if needed)
  // For now, let's just use the active ones from QStash as the primary source for "Active Jobs"
  const finalCronJobs = activeCronJobs.length > 0 ? activeCronJobs : cronJobs;

  return {
    heartbeat: heartbeatStatus,
    synthesis: synthesisData,
    cronJobs: finalCronJobs,
    integrations: integrationStatus,
  };
}
