import { Redis } from "@upstash/redis";
import type { ChatMessage } from "@/lib/types";

// Prefer UPSTASH_REDIS_REST_URL, fallback to Redis URL if needed
export const redis = Redis.fromEnv();

const SUBAGENT_CHAT_PREFIX = "subagent-chat:";

export async function getSubagentChatMessages(
  userId: string,
  agentSlug: string
): Promise<ChatMessage[]> {
  try {
    const key = `${SUBAGENT_CHAT_PREFIX}${userId}:${agentSlug}`;
    const data = await redis.get<ChatMessage[]>(key);
    return data || [];
  } catch (err) {
    console.error("Failed to get subagent chat messages from Redis", err);
    return [];
  }
}

export async function saveSubagentChatMessages(
  userId: string,
  agentSlug: string,
  messages: ChatMessage[]
): Promise<void> {
  try {
    const key = `${SUBAGENT_CHAT_PREFIX}${userId}:${agentSlug}`;
    // Keep it around for 30 days
    await redis.set(key, messages, { ex: 60 * 60 * 24 * 30 });
  } catch (err) {
    console.error("Failed to save subagent chat messages to Redis", err);
  }
}

export async function clearSubagentChatMessages(
  userId: string,
  agentSlug: string
): Promise<void> {
  try {
    const key = `${SUBAGENT_CHAT_PREFIX}${userId}:${agentSlug}`;
    await redis.del(key);
  } catch (err) {
    console.error("Failed to clear subagent chat messages from Redis", err);
  }
}
