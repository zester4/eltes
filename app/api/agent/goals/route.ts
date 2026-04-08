import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { auth } from "@/app/(auth)/auth";
import { generateUUID } from "@/lib/utils";

type GoalStatus = "active" | "paused" | "completed" | "archived";
type GoalItem = {
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

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Redis unavailable" }, { status: 503 });
  }

  const status = req.nextUrl.searchParams.get("status");
  const ids = await redis.smembers<string[]>(goalsSetKey(session.user.id));
  const goals: GoalItem[] = [];

  for (const id of ids ?? []) {
    const goal = await readGoal(redis, session.user.id, id);
    if (!goal) continue;
    if (status && goal.status !== status) continue;
    goals.push(goal);
  }

  goals.sort(
    (a, b) => b.priority - a.priority || b.updatedAt.localeCompare(a.updatedAt),
  );
  return NextResponse.json({ goals });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Redis unavailable" }, { status: 503 });
  }

  const body = (await req.json()) as Partial<GoalItem>;
  if (!body.title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const goal: GoalItem = {
    id: generateUUID(),
    title: body.title,
    description: body.description ?? "",
    status: "active",
    priority: (body.priority as GoalItem["priority"]) ?? 3,
    progress: 0,
    targetDate: body.targetDate,
    successCriteria: body.successCriteria ?? [],
    nextAction: body.nextAction,
    autonomousAllowed: body.autonomousAllowed ?? true,
    createdAt: now,
    updatedAt: now,
  };

  await Promise.all([
    redis.set(goalItemKey(session.user.id, goal.id), JSON.stringify(goal)),
    redis.sadd(goalsSetKey(session.user.id), goal.id),
  ]);

  return NextResponse.json({ goal });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Redis unavailable" }, { status: 503 });
  }

  const body = (await req.json()) as Partial<GoalItem> & { goalId?: string };
  if (!body.goalId) {
    return NextResponse.json({ error: "Missing goalId" }, { status: 400 });
  }

  const current = await readGoal(redis, session.user.id, body.goalId);
  if (!current) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  const updated: GoalItem = {
    ...current,
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.priority !== undefined ? { priority: body.priority } : {}),
    ...(body.progress !== undefined
      ? { progress: clampProgress(body.progress) }
      : {}),
    ...(body.targetDate !== undefined ? { targetDate: body.targetDate } : {}),
    ...(body.successCriteria !== undefined
      ? { successCriteria: body.successCriteria }
      : {}),
    ...(body.nextAction !== undefined ? { nextAction: body.nextAction } : {}),
    ...(body.autonomousAllowed !== undefined
      ? { autonomousAllowed: body.autonomousAllowed }
      : {}),
    updatedAt: new Date().toISOString(),
  };
  if (updated.progress >= 100 && updated.status === "active") {
    updated.status = "completed";
  }

  await redis.set(goalItemKey(session.user.id, body.goalId), JSON.stringify(updated));
  return NextResponse.json({ goal: updated });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Redis unavailable" }, { status: 503 });
  }

  const goalId = req.nextUrl.searchParams.get("goalId");
  if (!goalId) {
    return NextResponse.json({ error: "Missing goalId" }, { status: 400 });
  }

  await Promise.all([
    redis.del(goalItemKey(session.user.id, goalId)),
    redis.srem(goalsSetKey(session.user.id), goalId),
  ]);

  return NextResponse.json({ ok: true });
}
