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
    status: "active" | "inactive" | "error" | "pending" | "paused";
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

  // 0. Fetch last runs from Redis
  let lastHeartbeat: { lastRun?: string; status?: string } | null = null;
  let lastSynthesis: { lastRun?: string; status?: string } | null = null;
  
  if (redis) {
    const [hb, syn, isPaused] = await Promise.all([
      redis.get(`agent:status:${userId}:heartbeat`),
      redis.get(`agent:status:${userId}:synthesis`),
      redis.get(`agent:status:${userId}:paused`),
    ]);
    lastHeartbeat = typeof hb === 'string' ? JSON.parse(hb) : (hb as any);
    lastSynthesis = typeof syn === 'string' ? JSON.parse(syn) : (syn as any);

    if (isPaused === true || isPaused === "true") {
      return {
        heartbeat: {
          status: "paused",
          lastRun: lastHeartbeat?.lastRun,
        },
        synthesis: lastSynthesis?.lastRun ? { savedAt: lastSynthesis.lastRun } : {},
        cronJobs: [],
        integrations: [],
      };
    }
  }

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
        savedAt: m?.savedAt || lastSynthesis?.lastRun,
      };
    } else if (lastSynthesis?.lastRun) {
        synthesisData = {
            savedAt: lastSynthesis.lastRun,
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
              // Determine status: 
              // - "active" if last run was success
              // - "error" if last run failed
              // - "pending" if it exists but hasn't run successfully yet
              let status: AgentStatusData["heartbeat"]["status"] = "pending";
              if (lastHeartbeat?.status === "success") status = "active";
              else if (lastHeartbeat?.status === "error") status = "error";

              heartbeatStatus = {
                status,
                lastRun: lastHeartbeat?.lastRun,
                nextRun: (s.nextRun && typeof s.nextRun === "number") 
                  ? new Date(s.nextRun * 1000).toISOString() 
                  : undefined,
              };
            } else if (body.type === "weekly_synthesis") {
              // Force synthesis savedAt if not from vector
              if (!synthesisData.savedAt) {
                 synthesisData.savedAt = lastSynthesis?.lastRun;
              }
            } else if (body.type === "cron") {
              activeCronJobs.push({
                id: s.scheduleId,
                task: body.name || "Unnamed Job",
                status: "active",
                createdAt: (s.createdAt && typeof s.createdAt === "number") 
                  ? new Date(s.createdAt * 1000) 
                  : new Date(),
                cron: s.cron,
                nextRun: (s.nextRun && typeof s.nextRun === "number") 
                  ? new Date(s.nextRun * 1000).toISOString() 
                  : undefined,
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

  // 5. Merge Strategy:
  // - Pending tasks from DB (reminders)
  // - Recurring tasks from QStash
  // - Recent completed tasks from DB for history
  const finalCronJobs = [
    ...activeCronJobs,
    ...cronJobs.filter(tj => 
      !activeCronJobs.some(aqj => aqj.id === tj.id) &&
      (tj.status === "pending" || tj.status === "running")
    )
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    heartbeat: heartbeatStatus,
    synthesis: synthesisData,
    cronJobs: finalCronJobs,
    integrations: integrationStatus,
  };
}
