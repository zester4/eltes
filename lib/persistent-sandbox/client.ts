/**
 * lib/persistent-sandbox/client.ts
 *
 * Per-user persistent E2B sandbox manager.
 *
 * Each user gets ONE sandbox that persists indefinitely via pause/resume.
 * The sandboxId is stored in Redis. On every agent invocation, we resume
 * from the exact state the sandbox was in last time — full filesystem,
 * running processes, installed packages, everything.
 *
 * Lifecycle:
 *   create → active (up to 10 min) → auto-pause → [stored in Redis]
 *   resume → active (up to 10 min) → auto-pause → [same sandboxId in Redis]
 *
 * Cost model:
 *   Running:  billed per second
 *   Paused:   FREE (state preserved for up to 30 days)
 *   Keep-alive: QStash cron pings every 20 days to resume+pause, resetting the clock
 *
 * Install: pnpm add e2b
 * Env:     E2B_API_KEY
 */

import { Sandbox } from "e2b";
import { Redis } from "@upstash/redis";

// ── Redis key ─────────────────────────────────────────────────────────────────
// Stores the sandboxId for each user. TTL = 32 days (slightly above E2B's 30-day
// pause window — the keep-alive cron refreshes this before expiry).
const SANDBOX_KEY_TTL_SECONDS = 60 * 60 * 24 * 32; // 32 days

// Active window per wakeup — 10 minutes. After this, auto-pause kicks in.
// We do NOT keep the sandbox alive longer than needed; it's cheap to resume.
const ACTIVE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function sandboxKey(userId: string): string {
  return `agent:sandbox:${userId}`;
}

function getRedis(): Redis | null {
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

// ── Sandbox registry ──────────────────────────────────────────────────────────

/**
 * Get or create the persistent sandbox for a user.
 * Returns a live (running) sandbox ready to accept commands.
 *
 * On first call: creates a new sandbox, saves its ID to Redis.
 * On subsequent calls: resumes the paused sandbox from Redis.
 */
export async function getOrCreatePersistentSandbox(
  userId: string
): Promise<{ sandbox: Sandbox; sandboxId: string; isNew: boolean }> {
  const redis = getRedis();

  // 1. Check Redis for existing sandboxId
  let sandboxId: string | null = null;
  if (redis) {
    sandboxId = await redis.get<string>(sandboxKey(userId));
  }

  // 2. If we have an existing ID, try to connect to it (resumes if paused)
  if (sandboxId) {
    try {
      const sandbox = await Sandbox.connect(sandboxId, {
        timeoutMs: ACTIVE_TIMEOUT_MS,
      });
      console.log(`[PersistentSandbox] Connected to sandbox ${sandboxId} for user ${userId}`);
      return { sandbox, sandboxId, isNew: false };
    } catch (err: any) {
      // Sandbox expired (>30 days) or was manually killed — fall through to create
      console.warn(
        `[PersistentSandbox] Resume failed for ${sandboxId}: ${err?.message}. Creating new sandbox.`
      );
      sandboxId = null;
    }
  }

  // 3. Create a fresh sandbox
  const sandbox = await Sandbox.create({
    timeoutMs: ACTIVE_TIMEOUT_MS,
    // Auto-pause on timeout — filesystem + memory state preserved, billing stops
    lifecycle: {
      onTimeout: "pause",
    },
    metadata: { userId },
  });

  sandboxId = sandbox.sandboxId;
  console.log(`[PersistentSandbox] Created new sandbox ${sandboxId} for user ${userId}`);

  // 4. Bootstrap the sandbox environment
  await bootstrapSandbox(sandbox, userId);

  // 5. Persist the sandboxId to Redis
  if (redis) {
    await redis.set(sandboxKey(userId), sandboxId, {
      ex: SANDBOX_KEY_TTL_SECONDS,
    });
  }

  return { sandbox, sandboxId, isNew: true };
}

/**
 * One-time setup when a sandbox is first created for a user.
 * Installs common tools and creates the workspace directory structure.
 */
async function bootstrapSandbox(sandbox: Sandbox, userId: string): Promise<void> {
  try {
    // Create a clean workspace structure
    await sandbox.commands.run("mkdir -p /home/user/workspace /home/user/projects /home/user/.etles");

    // Write a README so the agent knows what this is
    await sandbox.files.write(
      "/home/user/.etles/README.md",
      `# Etles Persistent Sandbox\n\nThis is your personal persistent sandbox managed by Etles.\n\nAll files in /home/user/workspace and /home/user/projects persist across sessions.\n\nCreated: ${new Date().toISOString()}\nUser: ${userId}\n`
    );

    // Install uv (fast Python package manager) and common tools
    await sandbox.commands.run(
      "curl -LsSf https://astral.sh/uv/install.sh | sh 2>/dev/null || true",
      { timeoutMs: 30_000 }
    );

    console.log(`[PersistentSandbox] Bootstrap complete for user ${userId}`);
  } catch (err: any) {
    // Non-fatal — sandbox is still usable without bootstrap
    console.warn(`[PersistentSandbox] Bootstrap partial: ${err?.message}`);
  }
}

/**
 * Pause the sandbox immediately.
 * Call this after completing a task to stop billing and preserve state.
 * The next getOrCreatePersistentSandbox call will resume from this state.
 */
export async function pausePersistentSandbox(
  userId: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const sandboxId = await redis.get<string>(sandboxKey(userId));
  if (!sandboxId) return;

  try {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.pause();
    console.log(`[PersistentSandbox] Manually paused ${sandboxId}`);
  } catch {
    // Already paused or killed — no-op
  }
}

/**
 * Delete the sandbox and clear Redis. Creates a fresh one on next use.
 * Use when the user explicitly wants a clean slate.
 */
export async function resetPersistentSandbox(userId: string): Promise<void> {
  const redis = getRedis();
  const sandboxId = redis
    ? await redis.get<string>(sandboxKey(userId))
    : null;

  if (sandboxId) {
    try {
      await Sandbox.kill(sandboxId);
    } catch {
      // Already dead
    }
  }

  if (redis) {
    await redis.del(sandboxKey(userId));
  }

  console.log(`[PersistentSandbox] Reset sandbox for user ${userId}`);
}

/**
 * Keep-alive ping — resumes and immediately pauses to reset the 30-day expiry.
 * Called by QStash cron every 20 days per active user.
 */
export async function keepAlive(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const sandboxId = await redis.get<string>(sandboxKey(userId));
  if (!sandboxId) return;

  try {
    // Connect briefly (this resets the 30-day expiry clock on the paused snapshot)
    const sandbox = await Sandbox.connect(sandboxId, { timeoutMs: 60_000 });
    // Immediately re-pause to stop billing
    await sandbox.pause();
    // Refresh the Redis TTL
    await redis.expire(sandboxKey(userId), SANDBOX_KEY_TTL_SECONDS);
    console.log(`[PersistentSandbox] Keep-alive ping for ${sandboxId}`);
  } catch (err: any) {
    console.error(`[PersistentSandbox] Keep-alive failed: ${err?.message}`);
  }
}

/**
 * Get the raw sandboxId for a user without waking the sandbox.
 * Useful for status checks.
 */
export async function getPersistentSandboxId(
  userId: string
): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  return redis.get<string>(sandboxKey(userId));
}