import { createClient } from "redis";

import { isProductionEnvironment } from "@/lib/constants";
import { ChatbotError } from "@/lib/errors";

// IP rate limit is a spam guard for unauthenticated/guest requests only.
// Regular authenticated users are controlled by the per-user DB entitlement check.
const GUEST_MAX_MESSAGES = 10;
const AUTHENTICATED_MAX_MESSAGES = 100;
const TTL_SECONDS = 60 * 60;

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

export async function checkIpRateLimit(
  ip: string | undefined,
  isGuest = true
) {
  if (!isProductionEnvironment || !ip) {
    return;
  }

  // Authenticated (non-guest) users are rate-limited per-user via the DB count,
  // not per-IP. Skip the IP check for them entirely.
  if (!isGuest) {
    return;
  }

  const redis = getClient();
  if (!redis?.isReady) {
    return;
  }

  try {
    const key = `ip-rate-limit:${ip}`;
    const [count] = await redis
      .multi()
      .incr(key)
      .expire(key, TTL_SECONDS, "NX")
      .exec();

    const limit = isGuest ? GUEST_MAX_MESSAGES : AUTHENTICATED_MAX_MESSAGES;
    if (typeof count === "number" && count > limit) {
      throw new ChatbotError("rate_limit:chat");
    }
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
  }
}
