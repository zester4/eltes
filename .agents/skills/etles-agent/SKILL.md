---
name: etles-agent
description: >
  Core Etles Agent Infrastructure, Architecture, and Tools. Use this skill when modifying or extending Etles's core capabilities, editing sub-agents, handling webhooks (Telegram, GChat, Composio), dealing with long-term memory (Upstash Vector), autonomous missions, scheduling cron jobs/reminders (QStash), or adjusting the main chat router (`app/(chat)/api/chat/route.ts`). Triggers on "subagent", "memory", "schedule", "qstash", "upstash", "composio webhook", "telegram webhook", "gchat webhook", "heartbeat", "synthesis", "daytona", "sandbox", "approval", "mission", and "chat route".
---

# Etles Agent Infrastructure

This document is the authoritative guide for the Etles Agent architecture. It covers real-time chat, session persistence, long-term memory, durable subagents, proactive heartbeats, autonomous missions, and secure execution sandboxes.

## 1. Core Chat Interaction (`app/(chat)/api/chat/route.ts`)
The primary entry point for user interaction. It manages the conversation lifecycle and tool injection.
- **Entitlements**: Enforces rate limits and feature access based on `UserType`.
- **Tool Injection**: Automatically injects `Composio` tools for authenticated users.
- **Streaming**: Uses the AI SDK to stream text and tool call results via `createUIMessageStream`.
- **Persistence**: Saves user and assistant messages to the database via `saveMessages`.
- **UI Components**: Uses `renderChart`, `createDocument`, and `updateDocument` for rich interactive outputs.

## 2. Context & Memory Management

### Short-Term: Session Continuity (`lib/session-tail.ts`)
Maintains conversation context across page reloads and new chats using Redis.
- **Storage**: Keeps the last 2 messages (`TAIL_SIZE = 2`) per user in Redis (`session-tail:{userId}`).
- **Key format**: `session-tail:{userId}` with a 30-day TTL.
- **Injection**: `getSessionTail` retrieves this context and injects it into the system prompt of new chats so the agent "remembers" the immediate past.

### Long-Term: Persistent Memory (`lib/ai/tools/memory.ts`)
Uses **Upstash Vector** for semantic, per-user persistent memory.
- **Namespace**: `memory-{userId}`.
- **Embedding Model**: Uses `text-embedding-3-small` at the index level for automatic text embedding of raw strings.
- **Tools**:
  - `saveMemory`: Upserts a memory tuple `(key, content, tags)`.
  - `recallMemory`: Queries semantic matches using `topK`.
  - `updateMemory`: Overwrites an existing key with new content.
  - `deleteMemory`: Removes a specific key.

## 3. Distributed AI Routing & Providers (`lib/ai/providers.ts` & `lib/ai/models.ts`)
Etles uses a sophisticated routing layer to balance cost, speed, and capability.
- **AI Gateway**: Most traffic (including Title and Artifact models) routes through an AI Gateway for logging and load balancing.
- **Direct Providers**: Critical background tasks (Subagents, Heartbeats) use `getGoogleModel` to bypass the gateway and talk directly to Google Gemini for maximum reliability.
- **Model Selection & Tiering**:
  - **Premium Models**: `openai/gpt-5-mini`, `anthropic/claude-3.7-sonnet-thinking`.
  - **Lightweight Models**: `google/gemini-3.1-flash-lite-preview`, `openai/gpt-5-nano`.
  - **Specialized Reasoning**: Models suffixed with `-thinking` automatically use `extractReasoningMiddleware` for extended internal monologue.
- **Mocking**: Full support for `isTestEnvironment` using `models.mock` for local development.

## 4. Autonomous Agents & Tasks

### Subagents (`lib/agent/subagent-definitions.ts`, `lib/ai/tools/subagents.ts`)
Specialized agents delegated to handle out-of-band tasks.
- **Supported Slugs (21 total)**: 
  `inbox_operator`, `sdr`, `chief_of_staff`, `project_manager`, `social_media`, `hiring`, `finance`, `competitive_intel`, `customer_success`, `personal_admin`, `incident_response`, `stripe_churn`, `code_review`, `cloud_cost`, `product_analytics`, `contractor_payment`, `legal_operator`, `brand_monitor`, `revenue_forecasting`, `docs_keeper`, `investor_relations`.
- **Execution Flow**:
  1. `delegateToSubAgent` creates a `createAgentTask` in the DB.
  2. A message `###AGENT_DELEGATED###...` is saved to the chat to indicate status.
  3. Prefers **Upstash Workflow** (`triggerAgentWorkflow`) for durable execution (survives restarts/timeouts).
  4. Falls back to async HTTP delegation (`/api/agent/delegate`) or inline `runSubAgent`.
- **Reporting**: Results are saved as `###AGENT_RESULT###` in chat and pushed to the UI via `notifySubAgentHandoffToMainAgent`.

### Autonomous Missions (`lib/ai/tools/missions.ts`)
Multi-week autonomous campaigns aimed at business goals (e.g., "get 50 beta users").
- **Workflow**: Launches a 14-day durable campaign via Upstash Workflow.
- **Autonomous Activity**: The mission agent finds leads, runs outreach, and engages communities without user intervention.
- **Monitoring**: `getMissionStatus` tracks progress by querying workflow run logs.
- **Daily Reports**: The mission check-ins daily, posting progress reports directly to the user's chat.

## 5. Proactive Intelligence & Automation

### Background Intelligence (`app/api/agent/heartbeat/`)
Proactive health and context scanning that runs without user input.
- **Hourly Heartbeat**: Triggered by QStash scheduled cron. Scans Calendar, Email, and Tasks via Composio to detect urgent signals (upcoming meetings, high-priority unread emails).
- **Weekly Synthesis**: A specialized workflow that generates a week-in-review brief and saves it to Long-Term Memory.
- **Status Tracking**: Updates heartbeat health in Redis (`agent:status:{userId}:heartbeat`) and provides dashboard "Agent Is Online" indicators.
- **Signal Delivery**: Urgent items are pushed to the user via Telegram HTML formatted messages.

### Scheduling & Proactive Reminders (`lib/ai/tools/schedule.ts` & `/api/scheduled`)
Handles time-delayed tasks using **Upstash QStash**.
- **Tools**:
  - `setReminder`: One-shot delayed task (specify `delaySeconds`).
  - `setCronJob`: Recurring task using UTC cron format.
  - `listSchedules` / `deleteSchedule`: Manage existing cron jobs.
- **Proactive Agent (`app/(chat)/api/scheduled/route.ts`)**: When a schedule fires, QStash POSTs to this endpoint. It spawns a background agent to fulfill the reminder. This agent has its own system prompt and access to tools (Weather, Memory, Composio) to take autonomous action (e.g., "Send the email I scheduled").

### Composio Triggers & Webhooks (`app/api/composio/webhook/route.ts`)
Reacts to external events (GitHub commits, Slack messages, etc.) via webhooks.
- **Processing**: Recalls relevant memory context for the user and spawns a `proactive_etles` task to respond to the event immediately.

## 6. Security, Proxy & Authentication (`proxy.ts`)
Etles uses a custom proxy layer to manage session security and role-based access.
- **Path Protection**: Automatically allows public paths like `/api/auth`, `/api/composio`, and Telegram/GChat webhooks.
- **Cookie Security**: Enforces `secureCookie` in production and on SSL connections, which is critical for mobile browser compatibility.
- **Guest Access**: Uses the `guestRegex` to detect guest users and restricts their access to premium tool features.
- **Authentication**: Integrates with `next-auth/jwt` to verify user tokens before allowing internal API access.

## 7. Developer & Safety Tools

### Daytona Sandbox (`lib/ai/tools/daytona.ts`)
Secure, isolated environments for code execution and Git operations.
- **Tools**: `createSandbox`, `executeCommand`, `runCode`, `readFile`, `writeFile`, `listFiles`, `gitClone`, `gitCommit`, `gitPush`, etc.
- **Lifecycle**: Sandboxes auto-stop after inactivity (default 30m) and auto-delete after 2 hours to manage costs. Requires `DAYTONA_API_KEY`.

### Human-in-the-Loop (HITL) Approvals (`lib/ai/tools/queue-approval.ts`)
Mandatory safety gate for irreversible actions (Emails, Payments, Social Posts).
- **Queueing**: Stores the draft in Redis and sends a Telegram message with **Approve / Edit / Reject** buttons.
- **Execution**: Only proceeds with the Composio tool call once the user taps "Approve" via the Telegram callback handler.

## 8. Platform Integrations
- **Telegram**: Primary H2I (Human-to-Infrastructure) interface. Handles direct messages, inline keyboards, callback data (`edit:`, `approve:`, `reject:`), and proactive notifications.
- **Chat SDK (`lib/bot-handlers.ts`)**: Multi-platform support for Slack, Teams, Discord, GChat, etc., using unified event handlers (`onNewMention`, `onNewMessage`, `onSubscribedMessage`).
- **Webhook Registry**: Incoming updates are routed to platform-specific endpoints (e.g., `/api/webhooks/telegram/[userId]`) and must pass signature verification (e.g., `x-composio-signature`).
