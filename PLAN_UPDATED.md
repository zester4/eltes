# Etles: Telegram Fix, Sub-Agents, and Scheduled Results — Updated Plan

## 1. Telegram No-Response — Fix (No Task Classifier / Workflow)

### Root Cause

The Telegram route imports **removed modules** (`task-classifier`, `workflow-client`, `workflow-types`), causing import failure. Even before those existed, nothing happened — indicating additional issues.

### Fix Strategy

**A. Remove workflow/task-classifier logic entirely**

- Delete all imports and usage of `classifyTask`, `triggerAgentWorkflow`, `WorkflowPayload`.
- Use only the **inline path** for every message (no workflow dispatch).
- File: [`app/api/telegram/[userId]/route.ts`](app/api/telegram/[userId]/route.ts)

**B. Hardening and diagnostics**

1. **Redis** — `getOrCreateChat` uses Redis. If `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are missing, the route throws. Add a fallback: when Redis is unavailable, create a new chat every time (no cache) so the inline path still works.
2. **BASE_URL** — [`registerTelegramWebhook`](lib/telegram/webhook-registration.ts) uses `baseUrl`. The bot-integrations route uses `process.env.BASE_URL || new URL(req.url).origin`. For local dev with ngrok:
   - Set `BASE_URL=https://YOUR_NGROK_URL` in `.env`
   - Webhook must be reachable by Telegram (no localhost).
3. **TELEGRAM_SECRET_TOKEN** — If set, `setWebhook` sends `secret_token`; Telegram sends `x-telegram-bot-api-secret-token`. Mismatch causes 401. Either set consistently or leave unset.
4. **Bot integrations panel** — [`components/bot-integrations-panel.tsx`](components/bot-integrations-panel.tsx) saves via `POST /api/bot-integrations`. The API route at `app/(chat)/api/bot-integrations/route.ts` (or `app/api/bot-integrations/route.ts`) must exist and call `registerTelegramWebhook` for Telegram. The panel shows the webhook URL; ensure it matches what’s registered.
5. **`after()`** — In serverless, `after()` runs after the response. Ensure the runtime supports it and that errors inside `after()` are logged; the handler still returns 200 so Telegram won’t retry.

### Implementation

- Edit `app/api/telegram/[userId]/route.ts`:
  - Remove imports: `classifyTask`, `triggerAgentWorkflow`, `WorkflowPayload`.
  - Remove the classification and workflow branch.
  - After saving the user message, go straight to `sendTypingAction` → load history → `generateText` → save assistant message → `sendLongMessage`.
- Optional: make Redis usage resilient (skip cache if env vars missing).

---

## 2. Sub-Agents — Build All 16 Comprehensively (Learn from Chat Route)

### Goals

- Etles stays responsive; delegates to specialized agents.
- Sub-agents use Composio (500+ tools); Etles passes task names/descriptions.
- Chat page displays sub-agent actions in the message stream.

### Architecture (Pattern from Chat Route)

Use the same pattern as [`app/(chat)/api/chat/route.ts`](app/(chat)/api/chat/route.ts):

- `composio.create(userId)` + `session.tools()` for user-scoped Composio tools.
- `generateText` / `streamText` with tools, system prompt, and messages.
- Persist messages to DB and surface them in the chat UI.

### Data Model — Schema Only (No Manual SQL)

Add to [`lib/db/schema.ts`](lib/db/schema.ts):

```ts
export const agentTask = pgTable("AgentTask", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId").notNull().references(() => user.id),
  chatId: uuid("chatId").notNull().references(() => chat.id),
  agentType: varchar("agentType", { length: 64 }).notNull(), // e.g. "inbox_operator", "sdr"
  task: text("task").notNull(),
  status: varchar("status", { enum: ["pending", "running", "completed", "failed"] })
    .notNull()
    .default("pending"),
  result: json("result"), // { text, toolCalls?, error? }
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
```

Run `pnpm db:generate` to create the migration. Add CRUD in [`lib/db/queries.ts`](lib/db/queries.ts).

### Etles Tools for Sub-Agents

| Tool | Purpose |
|------|---------|
| `delegateToSubAgent` | Spawn sub-agent with `agentType` + `task`. Returns `taskId`. |
| `getSubAgentResult` | Fetch result for `taskId`. |
| `listSubAgents` | Return available agent types (from SUBAGENTS_PLAN). |

### Sub-Agent Runner (Per Agent Type)

Each of the 16 agents from [SUBAGENTS_PLAN.md](SUBAGENTS_PLAN.md) gets:

- **System prompt** — Role, boundaries, tools.
- **Composio toolkits** — Mapped from the plan (e.g. Inbox Operator → Gmail, Outlook, Slack, WhatsApp).
- **Execution** — `generateText` with `composio.create(userId).tools()` and optional `toolkits: [...]` filter.

Create `lib/agent/subagent-definitions.ts` with the 16 agent configs (prompt, toolkits) and `lib/agent/subagent-runner.ts` that runs a sub-agent and writes to `agentTask` + chat messages.

### Chat Display of Sub-Agent Actions

Sub-agent delegation and results appear as messages in the same chat:

- **Delegation** — When Etles calls `delegateToSubAgent`, save:
  - User-style message: `###AGENT_DELEGATED###${JSON.stringify({ agentType, task, taskId })}`
  - Or use the existing `message` table with `parts: [{ type: "text", text: ... }]` and a parseable prefix.
- **Result** — When the sub-agent completes, append assistant message with the result.
- **UI** — Follow the [`EventCard`](components/elements/event.tsx) pattern:
  - Add `parseAgentMessage()` and `AgentActionCard` in `components/elements/agent-action.tsx`.
  - In [`message.tsx`](components/message.tsx), detect the agent prefix and render `AgentActionCard` instead of plain text.
  - Sidebar: [`sidebar-history.tsx`](components/sidebar-history.tsx) and [`sidebar-history-item.tsx`](components/sidebar-history-item.tsx) use chat titles; no change needed unless you want agent-specific titles.

Flow:

1. Etles calls `delegateToSubAgent` → tool saves to `agentTask` + appends a delegation message to the chat.
2. API route or background job runs the sub-agent.
3. On completion, sub-agent runner saves the result to `agentTask` and appends an assistant message.
4. Chat page loads messages via `getMessagesByChatId` → `convertToUIMessages` → `Messages` / `PreviewMessage` render them, including `AgentActionCard` for agent messages.

### Integration Points

- [`app/(chat)/api/chat/route.ts`](app/(chat)/api/chat/route.ts): Add `delegateToSubAgent`, `getSubAgentResult`, `listSubAgents` to the tools object.
- [`lib/ai/prompts.ts`](lib/ai/prompts.ts): Extend system prompt with delegation triggers (e.g. "handle my inbox", "run outbound", "give me my brief").
- New API route: `POST /api/agent/delegate` — Called by the tool; enqueues sub-agent run (e.g. via `after()` or QStash).
- New API route: `GET /api/agent/tasks/[taskId]` — Used by `getSubAgentResult`.
- New components: `AgentActionCard`, `parseAgentMessage` in `components/elements/agent-action.tsx`.
- [`components/message.tsx`](components/message.tsx): Render `AgentActionCard` when `parseAgentMessage(text)` returns data.

---

## 3. Scheduled Task Results → Chat Page

### Current Flow

- [`lib/ai/tools/schedule.ts`](lib/ai/tools/schedule.ts) → QStash → [`app/(chat)/api/scheduled/route.ts`](app/(chat)/api/scheduled/route.ts).
- Scheduled route runs the agent and saves messages via `saveMessages`.
- Chat page loads `initialMessages` from DB once; no polling or real-time updates.

### Schema Consistency

- Scheduled route saves: `[Scheduled]: ${message}` as user message, then assistant + tool messages.
- [`convertToUIMessages`](lib/utils.ts) in `lib/utils.ts` maps `DBMessage` → `ChatMessage`; `message.parts` is passed through. Ensure scheduled messages use valid `parts` (e.g. `[{ type: "text", text: "..." }]`).
- No changes needed to `lib/db/helpers/01-core-to-parts.ts` (that file is a legacy migration script).

### Real-Time Display

- **Short term**: `router.refresh()` on `window` focus/visibility change so the page refetches and shows new messages.
- **Medium term**: Poll `GET /api/messages?chatId=...&since=...` when the chat is focused and append new messages to local state.
- Add a `useScheduledPolling` or extend existing polling in [`components/chat.tsx`](components/chat.tsx).

---

## 4. Implementation Order

| Phase | Task | Scope |
|-------|------|-------|
| 1 | Remove task-classifier, workflow-client, workflow-types from Telegram route | `app/api/telegram/[userId]/route.ts` |
| 1 | Make Redis optional in Telegram getOrCreateChat (fallback when env missing) | Same file |
| 1 | Verify BASE_URL, TELEGRAM_SECRET_TOKEN, bot integration setup | Config + bot-integrations-panel |
| 2 | Add `agentTask` table to `lib/db/schema.ts` | Schema only |
| 2 | Run `pnpm db:generate` | Migrations |
| 2 | Add agentTask CRUD in `lib/db/queries.ts` | Queries |
| 2 | Create `lib/agent/subagent-definitions.ts` (16 agents from SUBAGENTS_PLAN) | New file |
| 2 | Create `lib/agent/subagent-runner.ts` (run with Composio, like chat route) | New file |
| 2 | Create `lib/ai/tools/subagents.ts` (delegateToSubAgent, getSubAgentResult, listSubAgents) | New file |
| 2 | Add `POST /api/agent/delegate`, `GET /api/agent/tasks/[taskId]` | New routes |
| 2 | Wire subagent tools + prompt updates in chat route | `app/(chat)/api/chat/route.ts`, `lib/ai/prompts.ts` |
| 2 | Create `AgentActionCard`, `parseAgentMessage` | `components/elements/agent-action.tsx` |
| 2 | Update `message.tsx` to render AgentActionCard for agent messages | `components/message.tsx` |
| 3 | Add refresh-on-focus or polling for new messages | `components/chat.tsx` |
