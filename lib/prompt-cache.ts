import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

const PROMPT_CACHE_TTL_SECONDS = 60 * 5;

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

function promptCacheKey(userId: string, scope: string, signature: string) {
  const hash = createHash("sha256").update(signature).digest("hex").slice(0, 24);
  return `prompt-cache:${userId}:${scope}:${hash}`;
}

export async function getCachedSystemPrompt(args: {
  userId: string;
  scope: string;
  signature: string;
}): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get<string>(
    promptCacheKey(args.userId, args.scope, args.signature),
  );
  if (!raw) return null;
  return typeof raw === "string" ? raw : null;
}

export async function setCachedSystemPrompt(args: {
  userId: string;
  scope: string;
  signature: string;
  prompt: string;
}): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(
    promptCacheKey(args.userId, args.scope, args.signature),
    args.prompt,
    {
      ex: PROMPT_CACHE_TTL_SECONDS,
    },
  );
}
