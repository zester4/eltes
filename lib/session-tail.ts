import { createClient } from "redis";

// Stores the last 2 messages of a user's session in Redis.
// Key: session-tail:{userId}
// TTL: 30 days — no infrastructure changes, reuses REDIS_URL.

const TAIL_SIZE = 5;
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type TailMessage = {
  role: "user" | "assistant";
  text: string;
};

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!client && process.env.REDIS_URL) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", () => undefined);
    client.connect().catch(() => {
      client = null;
    });
  }
  return client;
}

function tailKey(userId: string) {
  return `session-tail:${userId}`;
}

/**
 * Returns the last 2 messages from the user's previous session, or [] if none.
 */
export async function getSessionTail(
  userId: string
): Promise<TailMessage[]> {
  try {
    const redis = getClient();
    if (!redis?.isReady) return [];
    const raw = await redis.get(tailKey(userId));
    if (!raw) return [];
    return JSON.parse(raw) as TailMessage[];
  } catch {
    return [];
  }
}

/**
 * Persists the last 2 messages of the current session for next time.
 * Call this inside onFinish via after() so it's non-blocking.
 */
export async function saveSessionTail(
  userId: string,
  messages: TailMessage[]
): Promise<void> {
  try {
    const redis = getClient();
    if (!redis?.isReady) return;
    const tail = messages.slice(-TAIL_SIZE);
    await redis.set(tailKey(userId), JSON.stringify(tail), {
      EX: TTL_SECONDS,
    });
  } catch {
    // silent — memory is best-effort
  }
}
