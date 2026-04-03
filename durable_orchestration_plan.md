# Durable Task-Driven Orchestration Plan

The goal is to unify all sub-agent execution (Hub Chat and Background Delegation) under a single, durable architecture. This resolves Vercel timeout issues by offloading the agent's multi-step loop to Upstash Workflow and making the UI "Task-Aware."

## User Review Required

> [!IMPORTANT]
> **Hub Chat Transition**: The Specialist Hub will transition from a "live stream" to a "Task Monitor." When you send a message, it triggers a durable background workflow. The UI will show real-time updates by polling the Task API (`/api/agent/tasks/[taskId]`).

> [!WARNING]
> **Latency**: Because each agent turn is now an independent durable step, there will be a slight increase in latency between "thoughts" (approx 0.5s overhead per step) in exchange for absolute reliability and support for 50+ step tasks.

## Proposed Changes

### [Core: Task-Driven Workflow]

#### [MODIFY] [workflow/route.ts](file:///c:/Users/mseyy/Downloads/eltes/app/api/agent/workflow/route.ts)
- **Implement Durable Loop**: Rewrite the `POST` handler to iterate manually through steps.
- Each turn:
  - `context.run("generate-thought")`: Call LLM with current history.
  - `context.run("execute-action")`: Execute tool calls.
  - `context.run("update-task")`: Update the `AgentTask` in the DB and save messages to Postgres.
- **Max Steps**: Increase to 50 allowed steps, as each step is its own durable request.

### [API: Sub-Agent Unification]

#### [MODIFY] [subagents/chat/route.ts](file:///c:/Users/mseyy/Downloads/eltes/app/(chat)/api/subagents/chat/route.ts)
- **Trigger-Only**: Refactor the route to purely create an `AgentTask` and trigger the workflow.
- Return the `taskId` to the UI immediately.

#### [MODIFY] [subagent-runner.ts](file:///c:/Users/mseyy/Downloads/eltes/lib/agent/subagent-runner.ts)
- **Modularize**: Split the monolithic runner into `initialization`, `logic_turn`, and `cleanup` phases to be used by the workflow steps.

### [UI: Task Monitoring]

#### [MODIFY] [subagent-chat.tsx](file:///c:/Users/mseyy/Downloads/eltes/components/subagent-chat.tsx)
- **Task Polling**: Update the component to poll `/api/agent/tasks/[taskId]` when a task is running.
- **Unified History**: Fetch history from the Task's messages rather than only Redis.

## Open Questions

- **Live Streaming**: Do we want to attempt "Durable Streaming" (where the workflow pushes to a Stream route via `notify`) or is standard polling sufficient for a "Specialist" context? Polling is safer for v1.

## Verification Plan

### Automated Tests
- Trigger a 10-step task from the Hub.
- Manually kill the dev server during step 3.
- Restart and verify the workflow continues from step 3 and completes the task.

### Manual Verification
- Verify the `AgentTask` table in the database correctly captures every step of a Hub conversation.
