# QStash Workflow Integration Plan for Etles

> **Goal**: Enable Etles and sub-agents to run multi-hour workflows with built-in stop, notify, and durable execution — overcoming serverless timeouts and transient failures.

---

## 1. Why QStash Workflow for Etles

| Problem | QStash Solution |
|--------|------------------|
| Serverless 10–60s timeouts | Each step is its own HTTP call; steps run independently |
| Sub-agent runs lasting hours | `context.sleep()` / `context.sleepUntil()` — no compute during waits |
| Human approval before actions | `context.waitForEvent()` — pause until external notify |
| Failures lose all progress | Durable state; failed steps retry; DLQ for persistent failures |
| User wants to stop a run | `client.cancel()` — cancel by workflow run ID |
| Long AI/tool chains | Multi-step workflows; each LLM call or tool = one step |

---

## 2. Core QStash Workflow Primitives

### 2.1 `context.sleep` / `context.sleepUntil`
- Pause for hours, days, weeks, months
- No compute during wait
- Resume automatically when delay expires

```ts
await context.sleep("wait-step", "2h");
// or
await context.sleepUntil("scheduled-step", new Date("2025-03-25T09:00:00Z"));
```

### 2.2 `context.waitForEvent` + `context.notify` / `client.notify`
- Pause until an external event (e.g. user approval)
- Timeout (default 7 days) if no event
- Notify from inside workflow or from external systems

```ts
// In workflow
const { eventData, timeout } = await context.waitForEvent(
  "wait-for-approval",
  `approval-${taskId}`,
  { timeout: "24h" }
);

// From API (user clicks approve in UI / Telegram)
await client.notify({
  eventId: `approval-${taskId}`,
  eventData: { approved: true, comment: "Looks good" },
  workflowRunId, // optional, for lookback — avoids race if notify sent before wait
});
```

### 2.3 `client.cancel`
- Stop a running workflow immediately

```ts
await client.cancel({ ids: workflowRunId });
```

### 2.4 `failureUrl` + `retries`
- Custom failure handler
- Configurable retries and retry delay

---

## 3. Architecture: Etles + QStash Workflow

### 3.1 High-Level Flow

```
User message (chat / Telegram)
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  Chat Route / Telegram Route                            │
│  - Quick responses: inline generateText (unchanged)      │
│  - Long / multi-step tasks: client.trigger(workflow)     │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  QStash Workflow: /api/agent/workflow                    │
│  Step 1: Parse task, maybe delegate to sub-agent         │
│  Step 2: context.run("agent-step", ...) — LLM + tools    │
│  Step 3: If needs approval → context.waitForEvent        │
│  Step 4: context.notify from /api/agent/notify           │
│  Step 5: Continue or context.sleep for follow-ups        │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  Sub-agents (Composio tools, etc.)                       │
│  - Run inside workflow steps                             │
│  - Each step = one HTTP call; no timeout limit           │
└─────────────────────────────────────────────────────────┘
```

### 3.2 When to Use Workflow vs Inline

| Scenario | Use |
|----------|-----|
| Quick Q&A, reminders, triggers | Inline `generateText` (current behavior) |
| Sub-agent delegation | Inline or workflow (workflow for long runs) |
| Multi-hour research, approval flows | QStash Workflow |
| Scheduled follow-ups (e.g. SDR Day 3) | QStash Workflow + `context.sleep` |
| Human-in-the-loop actions | QStash Workflow + `waitForEvent` + `notify` |

---

## 4. Implementation Plan

### Phase 1: Workflow Endpoint + Trigger (1–2 days)

1. **Create `/api/agent/workflow/route.ts`**
   - Use `serve` from `@upstash/workflow/nextjs`
   - Payload: `{ userId, chatId, task, agentType?, notifyEventId? }`
   - Step 1: Load context, select agent (main or sub-agent)
   - Step 2: `context.run("execute-agent", ...)` — call `runSubAgent` or main AI
   - Step 3: If approval needed → `context.waitForEvent(approvalEventId, { timeout })`
   - Step 4: On event → continue or send result to user

2. **Create `/api/agent/notify/route.ts`**
   - Receives: `eventId`, `eventData`, optional `workflowRunId`
   - Calls `client.notify(...)` so workflows waiting on that event resume
   - Secured: verify request (e.g. signed payload or secret header)

3. **Workflow client helper**
   - `lib/workflow/client.ts`: `triggerAgentWorkflow()`, `notifyWorkflow()`, `cancelWorkflow()`
   - Use `QSTASH_TOKEN` and `BASE_URL` from env

4. **Wire `delegateToSubAgent`**
   - For long tasks: call `triggerAgentWorkflow` instead of sync `/api/agent/delegate`
   - Store `workflowRunId` in `agentTask` (new column) for cancel/status

### Phase 2: Database + UX (1 day)

1. **Schema**
   - Add `workflowRunId` to `agentTask` (nullable)
   - Add `workflowStatus` if needed: `pending | running | waiting_approval | completed | cancelled`

2. **UI**
   - Show "Running in background" when workflow triggered
   - Poll or SSE for status; show "Waiting for approval" when `waitForEvent`
   - "Stop" button → `client.cancel({ ids: workflowRunId })`

3. **Approval UX**
   - When workflow waits: send Telegram/Slack message with approve/reject links
   - Links hit `/api/agent/notify` with `eventId`, `eventData: { approved, comment }`

### Phase 3: Multi-Step Patterns (1–2 days)

1. **SDR-style sequences**
   - Day 0: first touch
   - `context.sleep("wait-day-3", "3d")`
   - Day 3: follow-up
   - `context.sleep("wait-day-7", "4d")`
   - Day 7: third touch

2. **Approval gates**
   - Before irreversible action: `context.waitForEvent`
   - User gets link; on click → `notify` → workflow continues

3. **Failure handling**
   - Set `failureUrl` to `/api/agent/workflow/failure`
   - Log to DB, optionally notify user

---

## 5. Environment Variables

```env
# Required for QStash Workflow
QSTASH_TOKEN=...           # From Upstash Console
QSTASH_URL=...             # Optional; defaults to prod
BASE_URL=https://etles.app  # For workflow callback URLs

# Already used
POSTGRES_URL=...
OPENAI_API_KEY=...
```

---

## 6. Security

- Workflow endpoint: secured by QStash signing (verify `Upstash-Signature`)
- Notify endpoint: verify `x-agent-secret` or signed payload
- Never pass raw tokens in workflow payload; use `userId` and fetch server-side

---

## 7. File Structure (Proposed)

```
app/
  api/
    agent/
      workflow/
        route.ts      # Main workflow endpoint
        failure/
          route.ts    # failureUrl handler
      notify/
        route.ts      # External notify (approval links)
lib/
  workflow/
    client.ts         # trigger, notify, cancel
    types.ts          # Workflow payload types
```

---

## 8. Example: Sub-Agent with Approval

```ts
// app/api/agent/workflow/route.ts
import { serve } from "@upstash/workflow/nextjs";
import { runSubAgent } from "@/lib/agent/subagent-runner";

export const { POST } = serve<WorkflowPayload>(async (context) => {
  const { userId, chatId, task, agentType, needsApproval } = context.requestPayload;
  const eventId = `approval-${context.requestPayload.taskId}`;

  const result = await context.run("run-agent", async () => {
    return await runSubAgent({ userId, chatId, agentType, task });
  });

  if (needsApproval && result.requiresApproval) {
    // Send approval link to user (Telegram, etc.)
    await sendApprovalRequest(userId, chatId, eventId, context.workflowRunId);

    const { eventData, timeout } = await context.waitForEvent(
      "wait-approval",
      eventId,
      { timeout: "24h" }
    );

    if (timeout) {
      await notifyUser(userId, "Approval timed out");
      return { status: "timeout" };
    }

    if (eventData?.approved) {
      await context.run("execute-approved-action", () =>
        executeAction(result.action)
      );
    }
  }

  await deliverResult(userId, chatId, result);
  return { status: "completed" };
});
```

---

## 9. Success Criteria

- [ ] Workflow runs survive serverless restarts
- [ ] Sub-agents can run for hours via `sleep` between steps
- [ ] User can approve/reject via link; workflow resumes
- [ ] User can cancel a run via UI
- [ ] Failures are retried; persistent failures go to DLQ
- [ ] No breaking changes to existing chat/Telegram inline flow

---

## 10. References

- [Upstash Workflow Basics](https://upstash.com/docs/workflow/basics/how)
- [context.sleep](https://upstash.com/docs/workflow/basics/context/sleep)
- [context.waitForEvent](https://upstash.com/docs/workflow/basics/context/waitForEvent)
- [Notify](https://upstash.com/docs/workflow/features/notify)
- [client.cancel](https://upstash.com/docs/workflow/basics/client/cancel)
- [client.trigger](https://upstash.com/docs/workflow/howto/start)
