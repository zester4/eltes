import { createClient } from "redis";
import { Redis } from "@upstash/redis";

// Stores the last few messages of a user's session for cross-surface continuity.
// Key: session-tail:{userId}
// Prefers Upstash REST (same Redis as Telegram + agent status) when configured;
// falls back to REDIS_URL (node-redis) for local/dev.

const TAIL_SIZE = 5;
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type TailMessage = {
  role: "user" | "assistant";
  text: string;
};

let legacyClient: ReturnType<typeof createClient> | null = null;

function getLegacyClient() {
  if (!legacyClient && process.env.REDIS_URL) {
    legacyClient = createClient({ url: process.env.REDIS_URL });
    legacyClient.on("error", () => undefined);
    legacyClient.connect().catch(() => {
      legacyClient = null;
    });
  }
  return legacyClient;
}

function getUpstash(): Redis | null {
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

function tailKey(userId: string) {
  return `session-tail:${userId}`;
}

/**
 * Returns recent messages from the user's previous session, or [] if none.
 */
export async function getSessionTail(userId: string): Promise<TailMessage[]> {
  const upstash = getUpstash();
  if (upstash) {
    try {
      const raw = await upstash.get<string>(tailKey(userId));
      if (!raw) return [];
      if (typeof raw === "string") {
        return JSON.parse(raw) as TailMessage[];
      }
      return raw as TailMessage[];
    } catch {
      return [];
    }
  }

  try {
    const redis = getLegacyClient();
    if (!redis?.isReady) return [];
    const raw = await redis.get(tailKey(userId));
    if (!raw) return [];
    return JSON.parse(raw) as TailMessage[];
  } catch {
    return [];
  }
}

/**
 * Persists the tail of the current session for next time.
 * Call this inside onFinish via after() so it's non-blocking.
 */
export async function saveSessionTail(
  userId: string,
  messages: TailMessage[],
): Promise<void> {
  const payload = JSON.stringify(messages.slice(-TAIL_SIZE));
  const upstash = getUpstash();
  if (upstash) {
    try {
      await upstash.set(tailKey(userId), payload, { ex: TTL_SECONDS });
    } catch {
      // best-effort
    }
    return;
  }

  try {
    const redis = getLegacyClient();
    if (!redis?.isReady) return;
    await redis.set(tailKey(userId), payload, {
      EX: TTL_SECONDS,
    });
  } catch {
    // silent — memory is best-effort
  }
}
