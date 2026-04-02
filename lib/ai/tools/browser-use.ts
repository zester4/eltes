/**
 * lib/ai/tools/browser-use.ts
 *
 * Browser Use Cloud integration for Etles.
 * Uses the Browser Use REST API v2 — fully hosted, no self-hosting.
 * Agents submit natural-language tasks; BU handles all browser automation.
 *
 * Env vars:
 *   BROWSER_USE_API_KEY  — from cloud.browser-use.com/settings (starts with bu_)
 *
 * Architecture:
 *   - browserUseRunTask     → fire-and-poll for short tasks (<2 min)
 *   - browserUseStartTask   → async dispatch for long tasks, returns taskId
 *   - browserUseGetTask     → check status / retrieve result by taskId
 *   - browserUseControlTask → pause / resume / stop a running task
 *   - browserUseCreateSession → persistent browser session (saves cookies/auth)
 *   - browserUseGetLiveUrl  → get the real-time preview URL (embeddable iframe)
 *   - browserUseListTasks   → recent task history
 *   - browserUseCheckCredits → how much credit is left before billing surprises
 */

import { tool } from "ai";
import { z } from "zod";

const BU_BASE = "https://api.browser-use.com/api/v2";

// ── HTTP client ────────────────────────────────────────────────────────────────

function buHeaders(): Record<string, string> {
  const key = process.env.BROWSER_USE_API_KEY;
  if (!key) throw new Error("BROWSER_USE_API_KEY env var is not set.");
  return {
    "X-Browser-Use-API-Key": key,
    "Content-Type": "application/json",
  };
}

async function buFetch<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BU_BASE}${path}`, {
    method,
    headers: buHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`BU API ${method} ${path} → ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : ({} as T);
}

// ── Poll helper — used internally for short blocking tasks ────────────────────

const TERMINAL = new Set(["finished", "stopped", "failed"]);

async function pollUntilDone(
  taskId: string,
  maxWaitMs: number,
  intervalMs = 3000
): Promise<BUTask> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const task = await buFetch<BUTask>("GET", `/tasks/${taskId}`);
    if (TERMINAL.has(task.status)) return task;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  // Return whatever state we're at — caller inspects status
  return buFetch<BUTask>("GET", `/tasks/${taskId}`);
}

// ── Types (from OpenAPI spec) ─────────────────────────────────────────────────

interface BUTask {
  id: string;
  sessionId: string;
  status: "started" | "paused" | "finished" | "stopped" | "failed";
  task: string;
  output: string | null;
  steps: BUStep[];
  liveUrl?: string | null;
  finishedAt?: string | null;
  startedAt?: string | null;
}

interface BUStep {
  number: number;
  url?: string | null;
  memory?: string | null;
  evaluationPreviousGoal?: string | null;
  nextGoal?: string | null;
  screenshotUrl?: string | null;
}

interface BUSession {
  id: string;
  status: string;
  liveUrl?: string | null;
  startedAt?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. browserUseRunTask — submit + wait for result (blocking, for short tasks)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Primary tool. Submit a natural-language task and block until it finishes.
 *
 * Decision guide for the agent:
 * - Use this for tasks that complete in < 2 minutes (searches, extractions, form fills, logins)
 * - Use browserUseStartTask + browserUseGetTask for longer workflows (multi-site research, checkout flows)
 */
export const browserUseRunTask = () =>
  tool({
    description: `
Submit a browser automation task to Browser Use Cloud and wait for the result.
The agent (powered by their best LLM) will control a real cloud browser to complete your task.

USE THIS FOR:
- Web searches and data extraction ("go to X and return the top 10 results as JSON")
- Form filling and submissions ("fill the contact form on example.com with these details")
- Login flows ("log into github.com with email X and password Y")
- Price/product comparisons ("compare iPhone prices on amazon.com and bestbuy.com")
- Research tasks ("find the CEO of each company in this list")
- Anything requiring real browser interaction with natural language instructions

STRUCTURED OUTPUT: If you need JSON back (e.g. extracted data), set structuredOutputSchema
to a JSON Schema string describing the shape you want.

SESSIONS: If the user is already logged in (has a sessionId from browserUseCreateSession),
pass that sessionId to reuse their authenticated browser.

COST: ~$0.01 per task + per-step LLM cost. Check credits first with browserUseCheckCredits.
    `.trim(),
    inputSchema: z.object({
      task: z
        .string()
        .describe(
          "Natural language description of what to do. Be specific: include exact URLs, " +
          "target data to extract, values to fill, buttons to click, and expected output format. " +
          "Example: 'Go to https://news.ycombinator.com and return the top 5 post titles and URLs as JSON array.'"
        ),

      sessionId: z
        .string()
        .uuid()
        .optional()
        .describe(
          "Reuse an existing browser session (preserves login state, cookies). " +
          "Get one from browserUseCreateSession first for auth-required sites."
        ),

      startUrl: z
        .string()
        .url()
        .optional()
        .describe("Navigate to this URL immediately before starting the task."),

      maxSteps: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(50)
        .describe(
          "Max agent steps before stopping. More steps = more cost. " +
          "Simple tasks: 10-20. Complex multi-site workflows: 50-100. Default: 50."
        ),

      model: z
        .enum([
          "browser-use",   // Best — BU's own optimized model (fastest + cheapest)
          "gpt-4o",
          "gpt-4o-mini",
          "claude-sonnet-4-6",
          "gemini-2.0-flash",
        ])
        .optional()
        .default("browser-use")
        .describe("LLM model powering the agent. Default: 'browser-use' (recommended — best accuracy/speed/cost)."),

      allowedDomains: z
        .array(z.string())
        .optional()
        .describe(
          "Restrict the agent to only visit these domains. " +
          "Security best practice for tasks involving credentials. " +
          "E.g. ['github.com', 'api.github.com']"
        ),

      structuredOutputSchema: z
        .string()
        .optional()
        .describe(
          "JSON Schema string describing the exact output shape you want. " +
          "The agent will return data matching this schema. " +
          "Example: '{\"results\": [{\"title\": \"string\", \"url\": \"string\", \"price\": \"number\"}]}'"
        ),

      waitTimeoutSeconds: z
        .number()
        .int()
        .min(10)
        .max(300)
        .optional()
        .default(120)
        .describe(
          "How long to wait for the task to finish before returning (even if still running). " +
          "If it exceeds this, use browserUseGetTask to poll later. Default: 120s."
        ),

      saveBrowserData: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Save cookies and auth state from this session for reuse in future tasks. " +
          "Enable when doing login flows you want to persist."
        ),
    }),

    execute: async ({
      task,
      sessionId,
      startUrl,
      maxSteps,
      model,
      allowedDomains,
      structuredOutputSchema,
      waitTimeoutSeconds,
      saveBrowserData,
    }) => {
      try {
        // Build request body
        const body: Record<string, unknown> = {
          task,
          maxSteps: maxSteps ?? 50,
          llm: model ?? "browser-use",
          vision: true,
          saveBrowserData: saveBrowserData ?? false,
        };
        if (sessionId) body.sessionId = sessionId;
        if (startUrl) body.startUrl = startUrl;
        if (allowedDomains?.length) body.allowedDomains = allowedDomains;
        if (structuredOutputSchema) body.structuredOutput = structuredOutputSchema;

        // Submit
        const created = await buFetch<{ id: string; sessionId: string }>(
          "POST",
          "/tasks",
          body
        );
        const taskId = created.id;

        // Poll for completion
        const result = await pollUntilDone(
          taskId,
          (waitTimeoutSeconds ?? 120) * 1000
        );

        // Distill steps for context efficiency
        const stepSummary = result.steps?.slice(-5).map((s) => ({
          step: s.number,
          url: s.url,
          goal: s.nextGoal ?? s.evaluationPreviousGoal,
        }));

        return {
          success: TERMINAL.has(result.status) && result.status !== "stopped",
          taskId,
          sessionId: result.sessionId,
          status: result.status,
          output: result.output ?? null,
          liveUrl: result.liveUrl ?? null,
          recentSteps: stepSummary,
          tip:
            result.status === "started"
              ? `Task still running after ${waitTimeoutSeconds}s. Poll with browserUseGetTask(taskId: "${taskId}")`
              : undefined,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// 2. browserUseStartTask — fire-and-forget dispatch for long-running tasks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dispatch a task without blocking. Returns taskId immediately.
 * Use when the task might take > 2 minutes (multi-site research, checkout flows, etc.)
 * Then poll with browserUseGetTask.
 */
export const browserUseStartTask = () =>
  tool({
    description:
      "Fire-and-forget: submit a Browser Use task and return immediately with a taskId. " +
      "Use for long-running tasks (multi-step research, checkout flows, form-heavy workflows). " +
      "Then call browserUseGetTask with the taskId to check status and retrieve the result. " +
      "Always show the liveUrl to the user so they can watch in real time.",
    inputSchema: z.object({
      task: z.string().describe("Natural language task description."),
      sessionId: z.string().uuid().optional(),
      startUrl: z.string().url().optional(),
      maxSteps: z.number().int().min(1).max(200).optional().default(100),
      model: z
        .enum(["browser-use", "gpt-4o", "gpt-4o-mini", "claude-sonnet-4-6", "gemini-2.0-flash"])
        .optional()
        .default("browser-use"),
      allowedDomains: z.array(z.string()).optional(),
      structuredOutputSchema: z.string().optional(),
      saveBrowserData: z.boolean().optional().default(false),
    }),
    execute: async ({ task, sessionId, startUrl, maxSteps, model, allowedDomains, structuredOutputSchema, saveBrowserData }) => {
      try {
        const body: Record<string, unknown> = {
          task,
          maxSteps: maxSteps ?? 100,
          llm: model ?? "browser-use",
          vision: true,
          saveBrowserData: saveBrowserData ?? false,
        };
        if (sessionId) body.sessionId = sessionId;
        if (startUrl) body.startUrl = startUrl;
        if (allowedDomains?.length) body.allowedDomains = allowedDomains;
        if (structuredOutputSchema) body.structuredOutput = structuredOutputSchema;

        const created = await buFetch<{ id: string; sessionId: string }>("POST", "/tasks", body);

        // Fetch session to get live URL immediately
        let liveUrl: string | null = null;
        try {
          const session = await buFetch<BUSession>("GET", `/sessions/${created.sessionId}`);
          liveUrl = session.liveUrl ?? null;
        } catch (_) {}

        return {
          success: true,
          taskId: created.id,
          sessionId: created.sessionId,
          status: "started",
          liveUrl,
          message:
            `Task started. Poll with browserUseGetTask(taskId: "${created.id}"). ` +
            (liveUrl ? `Watch live: ${liveUrl}` : ""),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// 3. browserUseGetTask — check status and retrieve result
// ─────────────────────────────────────────────────────────────────────────────

export const browserUseGetTask = () =>
  tool({
    description:
      "Get the current status and result of a Browser Use task by taskId. " +
      "Call after browserUseStartTask or when browserUseRunTask timed out. " +
      "Returns output when status is 'finished'. Includes step-by-step trace.",
    inputSchema: z.object({
      taskId: z.string().uuid().describe("Task ID from browserUseRunTask or browserUseStartTask."),
      includeSteps: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include full step trace (URL, goal at each step). Useful for debugging."),
    }),
    execute: async ({ taskId, includeSteps }) => {
      try {
        const task = await buFetch<BUTask>("GET", `/tasks/${taskId}`);
        const isComplete = TERMINAL.has(task.status);

        return {
          taskId,
          status: task.status,
          done: isComplete,
          output: task.output ?? null,
          liveUrl: task.liveUrl ?? null,
          stepCount: task.steps?.length ?? 0,
          steps: includeSteps
            ? task.steps?.map((s) => ({
                step: s.number,
                url: s.url,
                goal: s.nextGoal ?? s.evaluationPreviousGoal,
                screenshot: s.screenshotUrl,
              }))
            : undefined,
          tip: !isComplete
            ? "Task still running. Call browserUseGetTask again in a few seconds."
            : undefined,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// 4. browserUseControlTask — pause / resume / stop
// ─────────────────────────────────────────────────────────────────────────────

export const browserUseControlTask = () =>
  tool({
    description:
      "Control a running Browser Use task: pause it (freeze agent), resume (continue), " +
      "or stop it entirely (terminates session too). " +
      "Use pause when you need to review progress or intervene manually via the liveUrl.",
    inputSchema: z.object({
      taskId: z.string().uuid(),
      action: z
        .enum(["pause", "resume", "stop", "stop_task_and_session"])
        .describe(
          "pause: freeze the agent mid-task. " +
          "resume: continue from where it paused. " +
          "stop: stop task but keep session alive. " +
          "stop_task_and_session: stop everything (saves costs)."
        ),
    }),
    execute: async ({ taskId, action }) => {
      try {
        const result = await buFetch<BUTask>("PATCH", `/tasks/${taskId}`, { action });
        return {
          success: true,
          taskId,
          newStatus: result.status,
          message: `Task ${taskId} → ${action} (status: ${result.status})`,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// 5. browserUseCreateSession — persistent authenticated browser session
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a persistent browser session.
 *
 * KEY USE CASES:
 * 1. Multi-step auth workflows: create session → login task → subsequent tasks reuse session
 * 2. Long workflows spanning multiple tasks on the same site
 * 3. Giving the agent a "warm" browser to avoid cold-start on every task
 */
export const browserUseCreateSession = () =>
  tool({
    description:
      "Create a persistent Browser Use cloud browser session. " +
      "The session keeps cookies, login state, and browser history alive across multiple tasks. " +
      "Use this BEFORE tasks that require login: create the session, run a login task on it, " +
      "then all subsequent tasks on that sessionId will be authenticated. " +
      "Sessions cost $0.05/hour — always stop them when done with browserUseControlTask(stop_task_and_session).",
    inputSchema: z.object({
      keepAlive: z
        .boolean()
        .optional()
        .default(true)
        .describe("Keep the session alive between tasks. Default: true."),
      startUrl: z
        .string()
        .url()
        .optional()
        .describe("URL to open immediately when session starts."),
      screenWidth: z.number().int().optional().default(1280),
      screenHeight: z.number().int().optional().default(800),
    }),
    execute: async ({ keepAlive, startUrl, screenWidth, screenHeight }) => {
      try {
        const body: Record<string, unknown> = {
          keepAlive: keepAlive ?? true,
          browserScreenWidth: screenWidth ?? 1280,
          browserScreenHeight: screenHeight ?? 800,
        };
        if (startUrl) body.startUrl = startUrl;

        const session = await buFetch<BUSession>("POST", "/sessions", body);

        return {
          success: true,
          sessionId: session.id,
          status: session.status,
          liveUrl: session.liveUrl ?? null,
          message:
            `Session created (id: ${session.id}). Pass this sessionId to browserUseRunTask for authenticated browsing. ` +
            `Cost: $0.05/hr. Stop when done.`,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// 6. browserUseGetLiveUrl — fetch the real-time preview URL
// ─────────────────────────────────────────────────────────────────────────────

export const browserUseGetLiveUrl = () =>
  tool({
    description:
      "Get the live browser preview URL for a running task or session. " +
      "This is a real-time iframe-embeddable URL the user can open to watch the agent work. " +
      "Always share this with the user immediately after starting any task.",
    inputSchema: z.object({
      sessionId: z
        .string()
        .uuid()
        .describe("Session ID from browserUseCreateSession or the sessionId returned by browserUseRunTask."),
    }),
    execute: async ({ sessionId }) => {
      try {
        const session = await buFetch<BUSession>("GET", `/sessions/${sessionId}`);
        return {
          success: true,
          sessionId,
          liveUrl: session.liveUrl ?? null,
          status: session.status,
          message: session.liveUrl
            ? `Open this to watch the agent live: ${session.liveUrl}`
            : "Live URL not yet available — session may still be starting.",
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// 7. browserUseListTasks — history and debugging
// ─────────────────────────────────────────────────────────────────────────────

export const browserUseListTasks = () =>
  tool({
    description:
      "List recent Browser Use tasks with their status and output. " +
      "Use to show the user their task history, find a taskId you lost, or debug a previous run.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(50).optional().default(10),
      status: z
        .enum(["started", "paused", "finished", "stopped"])
        .optional()
        .describe("Filter by status."),
      sessionId: z.string().uuid().optional().describe("Filter to tasks from a specific session."),
    }),
    execute: async ({ limit, status, sessionId }) => {
      try {
        const params = new URLSearchParams();
        params.set("pageSize", String(limit ?? 10));
        if (status) params.set("filterBy", status);
        if (sessionId) params.set("sessionId", sessionId);

        const data = await buFetch<{ items: BUTask[]; total: number }>(
          "GET",
          `/tasks?${params.toString()}`
        );

        const items = (data.items ?? []).map((t) => ({
          taskId: t.id,
          status: t.status,
          task: t.task?.slice(0, 100),
          output: t.output?.slice(0, 200) ?? null,
          startedAt: t.startedAt,
          finishedAt: t.finishedAt,
        }));

        return { success: true, tasks: items, total: data.total ?? items.length };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// 8. browserUseCheckCredits — check balance before expensive tasks
// ─────────────────────────────────────────────────────────────────────────────

export const browserUseCheckCredits = () =>
  tool({
    description:
      "Check the Browser Use Cloud account credit balance. " +
      "Call this before kicking off expensive multi-step workflows to confirm there are enough credits. " +
      "Also shows the plan and rate limit.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const data = await buFetch<{
          totalCreditsBalanceUsd: number;
          monthlyCreditsBalanceUsd: number;
          additionalCreditsBalanceUsd: number;
          rateLimit: number;
          planInfo: { planName: string; subscriptionStatus: string | null };
        }>("GET", "/billing/account");

        return {
          success: true,
          totalCreditsUsd: data.totalCreditsBalanceUsd,
          monthlyCreditsUsd: data.monthlyCreditsBalanceUsd,
          additionalCreditsUsd: data.additionalCreditsBalanceUsd,
          rateLimit: data.rateLimit,
          plan: data.planInfo?.planName,
          subscriptionStatus: data.planInfo?.subscriptionStatus,
          warning:
            data.totalCreditsBalanceUsd < 1
              ? "⚠️ Low credits (< $1). Top up at cloud.browser-use.com/billing before running tasks."
              : undefined,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });