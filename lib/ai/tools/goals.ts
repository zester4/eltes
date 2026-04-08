import { tool } from "ai";
import { Redis } from "@upstash/redis";
import { z } from "zod";
import { generateUUID } from "@/lib/utils";

export type GoalStatus = "active" | "paused" | "completed" | "archived";

export type GoalItem = {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  priority: 1 | 2 | 3 | 4 | 5;
  progress: number;
  targetDate?: string;
  successCriteria: string[];
  nextAction?: string;
  autonomousAllowed: boolean;
  createdAt: string;
  updatedAt: string;
  lastWorkedAt?: string;
};

function getRedis() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function goalsSetKey(userId: string) {
  return `goals:${userId}:ids`;
}

function goalItemKey(userId: string, goalId: string) {
  return `goals:${userId}:item:${goalId}`;
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, value));
}

async function readGoal(redis: Redis, userId: string, goalId: string) {
  const raw = await redis.get<string>(goalItemKey(userId, goalId));
  if (!raw) return null;
  return typeof raw === "string"
    ? (JSON.parse(raw) as GoalItem)
    : (raw as GoalItem);
}

export async function getActiveGoalsSnapshot(
  userId: string,
  limit = 5,
): Promise<GoalItem[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = await redis.smembers<string[]>(goalsSetKey(userId));
  const goals: GoalItem[] = [];

  for (const id of ids ?? []) {
    const goal = await readGoal(redis, userId, id);
    if (!goal) continue;
    if (goal.status !== "active") continue;
    goals.push(goal);
  }

  return goals
    .sort((a, b) => b.priority - a.priority || a.progress - b.progress)
    .slice(0, limit);
}

export const addGoal = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Create a new user goal so Etles can track and proactively help execute it.",
    inputSchema: z.object({
      title: z.string(),
      description: z.string().optional().default(""),
      priority: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
      ]).optional().default(3),
      targetDate: z.string().optional(),
      successCriteria: z.array(z.string()).optional().default([]),
      nextAction: z.string().optional(),
      autonomousAllowed: z.boolean().optional().default(true),
    }),
    execute: async ({
      title,
      description,
      priority,
      targetDate,
      successCriteria,
      nextAction,
      autonomousAllowed,
    }) => {
      const redis = getRedis();
      if (!redis) return { success: false, error: "Redis is not configured." };

      const now = new Date().toISOString();
      const goal: GoalItem = {
        id: generateUUID(),
        title,
        description,
        status: "active",
        priority,
        progress: 0,
        targetDate,
        successCriteria,
        nextAction,
        autonomousAllowed,
        createdAt: now,
        updatedAt: now,
      };

      await Promise.all([
        redis.set(goalItemKey(userId, goal.id), JSON.stringify(goal)),
        redis.sadd(goalsSetKey(userId), goal.id),
      ]);

      return { success: true, goal };
    },
  });

export const updateGoal = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Update an existing goal's fields: status, progress, next action, deadline, and metadata.",
    inputSchema: z.object({
      goalId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z
        .enum(["active", "paused", "completed", "archived"])
        .optional(),
      priority: z
        .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
        .optional(),
      progress: z.number().optional(),
      targetDate: z.string().optional(),
      successCriteria: z.array(z.string()).optional(),
      nextAction: z.string().optional(),
      autonomousAllowed: z.boolean().optional(),
    }),
    execute: async (input) => {
      const redis = getRedis();
      if (!redis) return { success: false, error: "Redis is not configured." };

      const current = await readGoal(redis, userId, input.goalId);
      if (!current) return { success: false, error: "Goal not found." };

      const updated: GoalItem = {
        ...current,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.progress !== undefined
          ? { progress: clampProgress(input.progress) }
          : {}),
        ...(input.targetDate !== undefined ? { targetDate: input.targetDate } : {}),
        ...(input.successCriteria !== undefined
          ? { successCriteria: input.successCriteria }
          : {}),
        ...(input.nextAction !== undefined ? { nextAction: input.nextAction } : {}),
        ...(input.autonomousAllowed !== undefined
          ? { autonomousAllowed: input.autonomousAllowed }
          : {}),
        updatedAt: new Date().toISOString(),
      };

      await redis.set(goalItemKey(userId, input.goalId), JSON.stringify(updated));
      return { success: true, goal: updated };
    },
  });

export const logGoalProgress = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Record progress for a goal and optionally set the next action for autonomous follow-up.",
    inputSchema: z.object({
      goalId: z.string(),
      delta: z.number().optional(),
      progress: z.number().optional(),
      note: z.string().optional(),
      nextAction: z.string().optional(),
    }),
    execute: async ({ goalId, delta, progress, note, nextAction }) => {
      const redis = getRedis();
      if (!redis) return { success: false, error: "Redis is not configured." };

      const current = await readGoal(redis, userId, goalId);
      if (!current) return { success: false, error: "Goal not found." };

      const computedProgress =
        progress !== undefined
          ? clampProgress(progress)
          : clampProgress(current.progress + (delta ?? 0));

      const now = new Date().toISOString();
      const updated: GoalItem = {
        ...current,
        progress: computedProgress,
        updatedAt: now,
        lastWorkedAt: now,
        ...(nextAction !== undefined ? { nextAction } : {}),
      };

      if (note) {
        const enrichedCriteria = [...updated.successCriteria, `Progress note (${now}): ${note}`];
        updated.successCriteria = enrichedCriteria.slice(-20);
      }
      if (updated.progress >= 100 && updated.status === "active") {
        updated.status = "completed";
      }

      await redis.set(goalItemKey(userId, goalId), JSON.stringify(updated));
      return { success: true, goal: updated };
    },
  });

export const listGoals = ({ userId }: { userId: string }) =>
  tool({
    description: "List goals for this user, optionally filtered by status.",
    inputSchema: z.object({
      status: z.enum(["active", "paused", "completed", "archived"]).optional(),
      limit: z.number().optional().default(25),
    }),
    execute: async ({ status, limit }) => {
      const redis = getRedis();
      if (!redis) return { success: false, error: "Redis is not configured." };

      const ids = await redis.smembers<string[]>(goalsSetKey(userId));
      const goals: GoalItem[] = [];
      for (const id of ids ?? []) {
        const goal = await readGoal(redis, userId, id);
        if (!goal) continue;
        if (status && goal.status !== status) continue;
        goals.push(goal);
      }

      const sorted = goals
        .sort((a, b) => b.priority - a.priority || b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit);

      return { success: true, goals: sorted, count: sorted.length };
    },
  });

export const deleteGoal = ({ userId }: { userId: string }) =>
  tool({
    description: "Delete a goal permanently.",
    inputSchema: z.object({
      goalId: z.string(),
    }),
    execute: async ({ goalId }) => {
      const redis = getRedis();
      if (!redis) return { success: false, error: "Redis is not configured." };

      await Promise.all([
        redis.del(goalItemKey(userId, goalId)),
        redis.srem(goalsSetKey(userId), goalId),
      ]);
      return { success: true, message: `Deleted goal ${goalId}.` };
    },
  });
