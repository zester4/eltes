---
name: etles-agent
description: >
  Core Etles Agent Infrastructure, Architecture, and Tools. Use this skill when modifying or extending Etles's core capabilities, editing sub-agents, handling webhooks (Telegram, GChat, Composio), dealing with long-term memory (Upstash Vector), scheduling cron jobs/reminders (QStash), or adjusting the main chat router (`app/(chat)/api/chat/route.ts`). Triggers on "subagent", "memory", "schedule", "qstash", "upstash", "composio webhook", "telegram webhook", "gchat webhook", and "chat route".
---

# Etles Agent Infrastructure

This document provides a comprehensive overview of the Etles Agent architecture, its available tools, webhooks, memory, subagents, triggers, and workflows. When modifying the agent's capabilities, strictly adhere to these established patterns.

## Core Chat Route (`app/(chat)/api/chat/route.ts`)
The main chat interaction occurs here. It streams responses using the `ai` SDK.
- Enforces Rate Limits and Entitlements based on `UserType` (guest vs. authenticated).
- Uses `createUIMessageStream` and streams tool executions.
- Injects `Composio` tools if the user is authenticated and not a guest.
- Available internal tools: `getWeather`, `renderChart`, `createDocument`, `updateDocument`, `requestSuggestions`.
- Available persistence & orchestration tools: Memory (Upstash), Schedule (QStash), Triggers (Composio), and Subagents.

## Session Continuity (`lib/session-tail.ts`)
Etles maintains short-term conversational continuity across page reloads and new chats using Redis.
- Stores the last 2 messages (`TAIL_SIZE = 2`) of a user's session.
- Key format: `session-tail:{userId}` with a 30-day TTL.
- Injected into the system prompt via `getSessionTail` so the agent remembers the immediate prior context when answering a new message.

## Long-Term Memory (`lib/ai/tools/memory.ts`)
Etles uses **Upstash Vector** for per-user long-term memory.
- **Namespacing**: Each user has their own namespace `memory-{userId}`.
- **Embedded Model**: Uses `text-embedding-3-small` (or similar) at the index level so raw text strings (`data`) are automatically embedded.
- **Tools**:
  - `saveMemory`: Upserts a memory tuple `(key, content, tags)`.
  - `recallMemory`: Queries semantic matches using `topK`.
  - `updateMemory`: Overwrites an existing key with new content.
  - `deleteMemory`: Removes a specific key.
- Recalled automatically during Subagent execution and Proactive Trigger events to provide rich context.

## Scheduling and Reminders (`lib/ai/tools/schedule.ts`)
Etles uses **Upstash QStash** to handle time-delayed tasks and cron jobs.
- **Delivery**: When a schedule fires, QStash POSTs the payload to `/api/scheduled`.
- **Tools**:
  - `setReminder`: One-shot delayed message (specify `delaySeconds`).
  - `setCronJob`: Recurring schedule using UTC cron format.
  - `listSchedules`: Lists all active schedules matching the `userId`.
  - `deleteSchedule`: Deletes a schedule by `scheduleId`.

## Subagents (`lib/agent/subagent-definitions.ts`, `lib/ai/tools/subagents.ts`, `lib/agent/subagent-runner.ts`)
Etles delegates specialized asynchronous tasks to **Subagents**. These subagents run out-of-band so the main chat thread isn't blocked.
- **Supported Slugs (21 total)**: 
  `inbox_operator`, `sdr`, `chief_of_staff`, `project_manager`, `social_media`, `hiring`, `finance`, `competitive_intel`, `customer_success`, `personal_admin`, `incident_response`, `stripe_churn`, `code_review`, `cloud_cost`, `product_analytics`, `contractor_payment`, `legal_operator`, `brand_monitor`, `revenue_forecasting`, `docs_keeper`, `investor_relations`.
- **Delegation Flow**:
  1. `delegateToSubAgent` is called from the main chat.
  2. A task is created in the DB (`createAgentTask`).
  3. A message `###AGENT_DELEGATED###...` is saved to the chat to indicate status.
  4. Execution gracefully degrades: QStash Workflow (`triggerAgentWorkflow`) -> HTTP Delegate (`/api/agent/delegate`) -> Inline execution (`runSubAgent`).
- **Execution (`runSubAgent`)**:
  - Provisions the subagent with its specific system prompt + recalled memory context.
  - Gives the subagent access to Composio tools, Weather, and Memory tools.
  - Saves a `###AGENT_RESULT###...` message upon completion/failure.
  - Calls `notifySubAgentHandoffToMainAgent` to push the result to the main UI.

## Workflows (`lib/workflow/client.ts`)
Etles utilizes **Upstash Workflow** (`@upstash/workflow`) for durable agent execution.
- Configured via `QSTASH_TOKEN` and `QSTASH_URL`.
- Exposes `triggerAgentWorkflow` which hits `/api/agent/workflow`.
- Ensures that long-running tasks don't fail due to serverless timeouts and can be retried automatically.

## Proactive Triggers & Composio Webhooks (`app/api/composio/webhook/route.ts` & `lib/ai/tools/triggers.ts`)
Etles can act proactively based on external events, primarily powered by **Composio webhooks and triggers**.
- **Tools**:
  - `setupTrigger`: Sets up a real-time event watcher (e.g. GitHub commits, new Slack messages). Uses Composio's dynamic config.
  - `listActiveTriggers`: Lists the user's active event triggers.
  - `removeTrigger`: Deletes an active trigger.
- **Webhook Processing**:
  1. Verifies `x-composio-signature` using `COMPOSIO_WEBHOOK_SECRET` (skips in dev mode).
  2. Parses `userId` and `triggerSlug`.
  3. Recalls relevant user memory from Upstash Vector as context.
  4. Spawns a `proactive_etles` task.
  5. Calls `generateText` with the `google/gemini-3-flash` (or equivalent) model to process the event, utilizing all tools (including Composio tools scoped to that user).
  6. Saves an `###EVENT_TRIGGERED###` message and any resulting AI response/tool calls back into the user's active chat.
  
## Platform Integrations & Webhooks
- **Telegram (`lib/telegram/webhook-registration.ts`)**: Registers incoming telegram updates directly to the serverless function `/api/telegram/[userId]`. Employs `setWebhook` with `secret_token` protection. Does **not** use the default Chat SDK webhook route.
- **Google Chat (`app/api/webhooks/gchat/route.ts`)**: Uses dynamic user-specific routes (`/api/webhooks/gchat/[userId]`). The top-level route intentionally returns a 400 error.
