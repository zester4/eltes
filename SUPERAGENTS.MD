ETLES EVOLUTION PLAN: MULTI-AGENT, SUPERMODE, AND COMPUTE


Start here:
https://upstash.com/docs/llms.txt
https://upstash.com/docs/workflow/basics/how
https://upstash.com/docs/workflow/basics/context
https://upstash.com/docs/workflow/basics/context/run.md
https://upstash.com/docs/workflow/basics/context/sleep.md
https://upstash.com/docs/workflow/basics/context/waitForEvent.md
https://upstash.com/docs/workflow/basics/context/notify.md
https://upstash.com/docs/workflow/basics/context/createWebhook.md
https://upstash.com/docs/workflow/basics/context/waitForWebhook.md
https://upstash.com/docs/workflow/basics/context/invoke.md
https://upstash.com/docs/workflow/basics/context/cancel.md
https://upstash.com/docs/workflow/basics/client/notify.md
https://upstash.com/docs/workflow/basics/client/dlq/resume.md
https://upstash.com/docs/workflow/basics/client/dlq/retryFailureFunction.md


==========================================
PART 1 — MULTI-AGENT COORDINATION: SEQUENTIAL AND PARALLEL
The Core Problem You're Solving
Right now, Etles delegates tasks to sub-agents via a fire-and-forget pattern: delegateToSubAgent creates an AgentTask row, triggers a QStash/Upstash Workflow run, and the main agent polls for results. This is adequate for single isolated delegations. It becomes severely limiting the moment you need two agents working off each other's output, or five agents tackling different parts of the same problem simultaneously and converging their findings.
What the Infrastructure Already Supports
You're sitting on Upstash Workflow, which was literally designed for this. The key primitives:
context.run() executes one step. Sequential coordination is just chaining these. Each step returns its result which the next step can consume. Already in your architecture.
Promise.all() inside Workflow turns any set of independent steps into parallel HTTP fan-out. Upstash sees multiple unfulfilled independent steps and fires them concurrently as separate HTTP invocations. No threads, no async complexity — it just works. Critical: there is no hard limit on the number of parallel steps.
context.invoke() is the more powerful primitive most people miss. It lets one Workflow call another Workflow and await its completion. This means an orchestrator workflow can spin up specialist sub-workflows, each running their own multi-step logic, and wait for all of them before proceeding. This is what makes a true orchestrator-worker topology possible.
flowControl lets you set ratePerSecond and parallelism ceilings on any workflow or step. If you're fanning out 20 agents simultaneously and you don't want to hammer Composio's API, you set a shared flow control key with parallelism: 5 and the queue handles backpressure automatically.
The Sequential Pattern
The simplest form is an orchestrator workflow that runs steps in order where each depends on the prior. The orchestrator asks the research agent to compile intelligence, waits for that result, passes it to the SDR agent for outreach drafting, waits for that, then passes both to the chief-of-staff agent for the final brief. Each agent runs inside its own context.invoke() call, is fully durable, auto-retried on failure, and the orchestrator never times out regardless of how long each agent takes.
The Parallel Pattern
The second pattern is fan-out: the orchestrator identifies N independent tasks and fires all N sub-agent workflows simultaneously using Promise.all() wrapped around multiple context.invoke() calls. A competitive intelligence brief, for example, could fan out to one agent per competitor simultaneously, then a synthesis agent collects all results. The total wall-clock time is the slowest single agent, not the sum of all agents.
The Hybrid Pattern: The Real Power Move
The most powerful pattern is sequential stages where each stage internally parallelizes. Stage one is a single planning agent that decomposes the goal. Stage two fans out to N specialist agents in parallel. Stage three is a single synthesis agent that consolidates. Stage four is a single delivery agent that sends the result. Upstash Workflow handles all the state, all the durability, all the retries across every stage. Your Vercel functions are stateless — they're just the execution surface. The orchestration intelligence lives in QStash.
What You Need to Build
A new workflow endpoint: /api/agent/orchestrate. It receives a goal, an optional agentTeam (list of slugs), and an optional strategy (sequential, parallel, or mixed). The orchestrator uses a planning step to decompose the goal into agent-specific subtasks, then invokes each agent workflow using context.invoke(), and collects results. You introduce a new AgentOrchestration table in the DB to track multi-agent runs, linked to the constituent AgentTask rows. The UI shows a tree view of the orchestration: which agents were spawned, their status, their outputs, and the synthesized result.
The planning step is itself an LLM call: given the goal and the available agent slugs, output a structured JSON plan with agent assignments, task descriptions for each, dependency graph (which agents can run in parallel, which must wait), and expected output format. This makes the system genuinely self-organizing.

PART 2 — SUPERMODE: AUTONOMOUS ETLES WITH NO VERCEL LIMITS
The Core Problem
Vercel has a 60-second limit on serverless function execution. Your main chat route already works around this via Upstash Workflow (each step is a separate invocation). But you can't run a true long-horizon autonomous agent loop inside a single function invocation. The agent would need to: receive a high-level objective, plan a multi-hour execution, take dozens of tool actions sequentially, adapt based on intermediate results, and report back — all without a human in the loop.
What SuperMode Actually Is
SuperMode is Etles running as a continuous, self-directed execution loop against a user-provided objective. It is the difference between "delegate this task to the SDR agent" and "achieve 50 beta signups by end of next week — figure out how." The agent should be able to plan, execute, observe, revise, and re-execute across hours or days without the user doing anything.
The Architecture
The entire execution lives inside an Upstash Workflow. The workflow runs indefinitely — each step is a separate invocation, so there is no Vercel timeout. The agent's reasoning loop is encoded as a series of workflow steps. Each step calls an LLM, which decides the next action, executes it via tool call, observes the result, and returns a structured decision: continue (what's the next step), pause (await an external event or human approval), or complete (goal achieved or unreachable).
The trick is that you never have a single long-running function. You have a chain of short-running functions each doing one thing. Upstash stitches them into a coherent execution with durable state. Each step can run up to the QStash per-step timeout (which is generous — minutes per step), and the workflow itself can run for weeks.
The Approval Gate Pattern
For any irreversible action (sending an email, spending money, making a public post), the SuperMode workflow hits context.waitForEvent() and pauses. It fires a Telegram message to the user with the proposed action and a one-tap approve/deny inline keyboard. The user taps. The /api/telegram/callback/[userId] endpoint calls notifyWorkflow() with the approval decision. The workflow resumes from exactly where it paused. This is already partially implemented in Etles — you extend it to be the universal gate for SuperMode actions.
The Activity Feed
The key to making SuperMode feel safe and observable is a real-time activity feed visible on the UI. Every step the workflow takes should write a structured log entry to your DB: timestamp, step name, action taken, tool called, inputs, outputs, and the agent's internal reasoning for taking this action. The UI polls this feed (or uses SSE) and renders it as a live timeline the user can watch. Think of it like watching a trading bot's decision log in real time. Every action is visible, every reasoning step is visible, and the user can hit a kill switch at any time which cancels the Upstash Workflow run via client.cancel().
The On/Off Toggle
The UI has a SuperMode toggle. When turned on for a given objective, it triggers the orchestrator workflow with full autonomous permissions. The workflow writes an autonomous_session record to the DB with status running. Every tool action taken writes to a supermode_actions log table. The toggle turning off calls cancelWorkflow() for the active run. The feed shows all of this in real time.

PART 3 — SUPERMODE COMPUTE: ETLES'S OWN COMPUTER
The Core Insight from Research
What Perplexity Computer does with Firecracker VMs, what AWS Lambda does with microVMs, what Daytona does with sandboxes — they're all solving the same problem: give the AI agent a persistent, isolated, stateful environment it owns and can operate from. The agent isn't just calling APIs. It has a filesystem it can write to, a shell it can run processes in, a browser it can control, and it remembers state between sessions.
The difference between Etles's current Daytona integration and what SuperMode needs is persistence and identity. Right now Daytona sandboxes are task-scoped: create, run, delete. SuperMode needs a sandbox that persists for the duration of the objective — potentially days — and accumulates state, intermediate artifacts, working files, and memory across tool calls.
Option A: Upstash Box — The Best Path for Etles
You are already deep in the Upstash stack. Upstash Box is their March 2026 product that is exactly what you need and was built precisely for this use case. Every Box is an isolated container with its own filesystem, shell, network stack, and optional coding agent (Claude Code, Codex, or OpenCode built in). Boxes freeze when idle, wake in milliseconds. No maximum session duration — you can resume days or weeks later. Durable block storage so the agent's working files persist across sessions. Billed per active CPU time, not idle time, so it scales to zero between actions.
The pattern for SuperMode: when a user activates SuperMode for an objective, you provision one Upstash Box for that session. The Box gets the objective, the user's credentials (via environment variables), and a set of tool definitions. The SuperMode Upstash Workflow orchestrates tool calls by sending commands to the Box via the @upstash/box SDK. The Box accumulates working files, code it writes, data it downloads, and web pages it scrapes in its own filesystem. Between steps, the Box freezes (zero cost). When the next step fires, the Box wakes in milliseconds and picks up exactly where it left off.
For parallelism, you can fan out to multiple Boxes — one per sub-agent — then collect results. Each Box runs fully isolated. The orchestrator workflow coordinates across them without any of them being aware of each other.

The Architecture of a SuperMode Session
The user enables SuperMode with an objective. The Vercel API creates an Upstash Box for that objective session, stores the Box ID in the autonomous_sessions table, and triggers the SuperMode orchestrator workflow on Upstash. The workflow runs its planning step, creates a day-by-day execution plan, then begins executing. Each execution step sends a command to the Box via the Upstash Box SDK: run this script, write this file, call this API, process this data. The Box executes the command, returns structured output, and freezes until the next step fires. Every action is written to the supermode_actions log with the command, the output, the model's reasoning, and the elapsed time. The Vercel UI polls this log (or subscribes via a Postgres realtime channel if you configure one) and renders the live activity feed.
When the workflow hits an approval gate, it writes a pending_approval record, fires a Telegram message with context, and calls context.waitForEvent(). The live feed shows "Awaiting your approval" with the full action description. The user taps approve or deny from Telegram or from the UI. The response calls notifyWorkflow() and execution resumes.
At the end of the objective (success, failure, or user cancellation), the workflow writes a full SuperMode report: what was accomplished, what was attempted and failed, what artifacts were created, and where they're stored. The Box is archived (not deleted) so the filesystem state persists for future reference or continuation.
What the UI Needs
A SuperMode panel, separate from the chat panel. It shows: the active objective, the live action feed, the current status (Planning, Executing, Awaiting Approval, Paused, Complete), a timeline of all steps taken, the artifacts produced, and a kill switch. The kill switch calls your /api/agent/tasks/[taskId]/cancel endpoint, which calls cancelWorkflow() and archives the Box. Optionally, a "take over" button pauses SuperMode and opens the related Box in a Daytona or Upstash Box remote development session so you can inspect its filesystem and manually intervene.