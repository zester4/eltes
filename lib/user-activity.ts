/**
 * Tracks last user activity for proactive check-ins (heartbeat) and related UX.
 * Uses Upstash Redis when configured (same as other agent infrastructure).
 * lib/user-activity.ts
 */

const LAST_ACTIVITY_PREFIX = "user:last_activity:";
const CHECKIN_COOLDOWN_PREFIX = "user:checkin_cooldown:";

function getRedis(): InstanceType<
  typeof import("@upstash/redis").Redis
> | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export async function touchUserActivity(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const key = `${LAST_ACTIVITY_PREFIX}${userId}`;
  await redis.set(key, new Date().toISOString(), {
    ex: 60 * 60 * 24 * 90,
  });
}

export function silenceCheckInThresholdMs(): number {
  const raw = process.env.ETLES_SILENCE_HOURS ?? "6";
  const hours = Number(raw);
  const h = Number.isFinite(hours) && hours > 0 ? hours : 6;
  return h * 60 * 60 * 1000;
}

const CHECKIN_COOLDOWN_SECONDS = 60 * 60 * 24;

export async function shouldSendSilenceCheckIn(userId: string): Promise<{
  should: boolean;
  lastActivityIso?: string;
}> {
  const redis = getRedis();
  if (!redis) {
    return { should: false };
  }

  const lastRaw = await redis.get<string>(`${LAST_ACTIVITY_PREFIX}${userId}`);
  if (!lastRaw || typeof lastRaw !== "string") {
    return { should: false };
  }

  const lastMs = Date.parse(lastRaw);
  if (!Number.isFinite(lastMs)) {
    return { should: false };
  }

  if (Date.now() - lastMs < silenceCheckInThresholdMs()) {
    return { should: false, lastActivityIso: lastRaw };
  }

  const cooldownKey = `${CHECKIN_COOLDOWN_PREFIX}${userId}`;
  const cooling = await redis.get(cooldownKey);
  if (cooling === true || cooling === "true" || cooling === 1) {
    return { should: false, lastActivityIso: lastRaw };
  }

  return { should: true, lastActivityIso: lastRaw };
}

export async function markSilenceCheckInSent(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(`${CHECKIN_COOLDOWN_PREFIX}${userId}`, "1", {
    ex: CHECKIN_COOLDOWN_SECONDS,
  });
}
