/**
 * lib/agent/subagent-runner.ts — UPDATED
 *
 * Key changes from the original:
 *   1. Added spawnChildAgent, waitForChildAgents, getCollaborationStatus
 *      to ALL sub-agents so any specialist can spawn another.
 *   2. Added task_coordinator agent with full collaboration tool suite.
 *   3. After every task completes, calls notifyParentAgent() if parentEventId
 *      was passed — this is how A2A waitForEvent works.
 *
 * Collaboration tools are injected into every agent run — the tools are
 * cheap (no-op if never called) and any agent may discover it needs to
 * delegate mid-task.
 */

import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { generateText, stepCountIs } from "ai";
import { getSubAgentBySlug } from "@/lib/agent/subagent-definitions";
import { getGoogleModel } from "@/lib/ai/providers";
import { generateImageTool } from "@/lib/ai/tools/generate-image";
import { generateVideoTool } from "@/lib/ai/tools/generate-video";
import { getWeather } from "@/lib/ai/tools/get-weather";
import {
  deleteMemory,
  recallMemory,
  saveMemory,
  updateMemory,
} from "@/lib/ai/tools/memory";
import { notifySubAgentHandoffToMainAgent } from "@/lib/agent/subagent-handoff-notify";
import {
  spawnChildAgent,
  waitForChildAgents,
  getCollaborationStatus,
} from "@/lib/ai/tools/collaborate";
import { notifyParentAgent } from "@/lib/agent/agent-bus";
import type { DBMessage } from "@/lib/db/schema";
import { saveMessages, updateAgentTask } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";
import { Index } from "@upstash/vector";
import { launchMission, getMissionStatus } from "@/lib/ai/tools/missions";
import {
  setReminder,
  setCronJob,
  listSchedules,
  deleteSchedule,
} from "@/lib/ai/tools/schedule";
import {
  upsertKnowledgeEntity,
  addKnowledgeRelation,
  getKnowledgeEntity,
  searchKnowledgeGraph,
  deleteKnowledgeEntity,
  deleteKnowledgeRelation,
} from "@/lib/ai/tools/knowledge-graph";
import {
  addGoal,
  updateGoal,
  logGoalProgress,
  listGoals,
  deleteGoal,
} from "@/lib/ai/tools/goals";
import {
  tavilySearch,
  tavilyExtract,
  tavilyCrawl,
  tavilyMap,
} from "@/lib/ai/tools/tavily-search";
import { wikiQuery, wikiIngest } from "@/lib/ai/tools/wiki";
import * as daytonaTools from "@/lib/ai/tools/daytona";
import * as browserUseTools from "@/lib/ai/tools/browser-use";
import * as daytonaBrowserTools from "@/lib/ai/tools/daytona-browser";
import { getPersistentSandboxTools } from "@/lib/ai/tools/persistent-sandbox";
import * as twilio from "@/lib/ai/tools/twilio";

const composio = new Composio({ provider: new VercelProvider() });

async function recallRelevantMemory(userId: string, query: string): Promise<string> {
  try {
    const index = new Index({
      url: process.env.UPSTASH_VECTOR_REST_URL!,
      token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
    });
    const ns = index.namespace(`memory-${userId}`);
    const results = await ns.query({ data: query, topK: 5, includeMetadata: true });
    if (!results.length) return "";
    const lines = results.map((r) => {
      const meta = r.metadata as any;
      return `• [${meta?.key ?? "memory"}]: ${meta?.content ?? ""}`;
    });
    return `\n\n═══════════════════════════════════════════\nUSER MEMORY (relevant context recalled)\n═══════════════════════════════════════════\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

export interface RunSubAgentParams {
  taskId: string;
  userId: string;
  chatId?: string;
  agentType: string;
  task: string;
  /**
   * If this agent was spawned by another agent (A2A), the parent's eventId.
   * On completion (success or failure), we notify this event so the parent
   * workflow can resume from context.waitForEvent().
   */
  parentEventId?: string;
}

export async function runSubAgent(params: RunSubAgentParams): Promise<{
  success: boolean;
  text?: string;
  error?: string;
}> {
  const { taskId, userId, chatId, agentType, task, parentEventId } = params;

  const definition = getSubAgentBySlug(agentType);
  if (!definition) {
    const error = `Unknown agent type: ${agentType}`;
    await updateAgentTask({ id: taskId, userId, status: "failed", result: { error } });
    if (parentEventId) {
      await notifyParentAgent(parentEventId, {
        taskId, agentType, success: false, error,
        completedAt: new Date().toISOString(),
      }).catch(() => {});
    }
    return { success: false, error };
  }

  await updateAgentTask({ id: taskId, userId, status: "running" });

  let composioTools: Record<string, unknown> = {};
  try {
    const session = await composio.create(userId, { manageConnections: true });
    composioTools = await session.tools();
  } catch {
    /* Composio optional */
  }

  const baseUrl =
    process.env.BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  // ── A2A collaboration tools — available to ALL agents ────────────────────
  const collaborationTools = {
    spawnChildAgent: spawnChildAgent({
      userId,
      chatId: chatId ?? "",
      parentEventId: undefined,
    }),
    waitForChildAgents: waitForChildAgents(),
    getCollaborationStatus: getCollaborationStatus(),
  };

  const persistentSandboxTools =
    agentType === "sandbox_specialist" || agentType === "browser_operator"
      ? getPersistentSandboxTools({ userId })
      : {};

  const tools = {
    ...composioTools,
    ...persistentSandboxTools,
    ...collaborationTools,
    getWeather,
    generateImage: generateImageTool(),
    generateVideo: generateVideoTool(),
    saveMemory: saveMemory({ userId }),
    recallMemory: recallMemory({ userId }),
    updateMemory: updateMemory({ userId }),
    deleteMemory: deleteMemory({ userId }),
    launchMission: launchMission({ userId, chatId, baseUrl }),
    getMissionStatus: getMissionStatus({ userId }),
    setReminder: setReminder({ userId, baseUrl }),
    setCronJob: setCronJob({ userId, baseUrl }),
    listSchedules: listSchedules({ userId }),
    deleteSchedule: deleteSchedule(),
    upsertKnowledgeEntity: upsertKnowledgeEntity({ userId }),
    addKnowledgeRelation: addKnowledgeRelation({ userId }),
    getKnowledgeEntity: getKnowledgeEntity({ userId }),
    searchKnowledgeGraph: searchKnowledgeGraph({ userId }),
    deleteKnowledgeEntity: deleteKnowledgeEntity({ userId }),
    deleteKnowledgeRelation: deleteKnowledgeRelation({ userId }),
    addGoal: addGoal({ userId }),
    updateGoal: updateGoal({ userId }),
    logGoalProgress: logGoalProgress({ userId }),
    listGoals: listGoals({ userId }),
    deleteGoal: deleteGoal({ userId }),
    tavilySearch,
    tavilyExtract,
    tavilyCrawl,
    tavilyMap,
    wikiQuery: wikiQuery(),
    wikiIngest: wikiIngest(),

    // Sandbox tools for specialist agents
    ...(agentType === "sandbox_specialist" || agentType === "browser_operator"
      ? {
          createSandbox: daytonaTools.createSandbox({ userId }),
          listSandboxes: daytonaTools.listSandboxes({ userId }),
          deleteSandbox: daytonaTools.deleteSandbox({ userId }),
          executeCommand: daytonaTools.executeCommand({ userId }),
          runCode: daytonaTools.runCode({ userId }),
          listFiles: daytonaTools.listFiles({ userId }),
          readFile: daytonaTools.readFile({ userId }),
          writeFile: daytonaTools.writeFile({ userId }),
          createDirectory: daytonaTools.createDirectory({ userId }),
          searchFiles: daytonaTools.searchFiles({ userId }),
          replaceInFiles: daytonaTools.replaceInFiles({ userId }),
          gitClone: daytonaTools.gitClone({ userId }),
          gitStatus: daytonaTools.gitStatus({ userId }),
          gitCommit: daytonaTools.gitCommit({ userId }),
          gitPush: daytonaTools.gitPush({ userId }),
          gitPull: daytonaTools.gitPull({ userId }),
          gitBranch: daytonaTools.gitBranch({ userId }),
          getPreviewLink: daytonaTools.getPreviewLink({ userId }),
          runBackgroundProcess: daytonaTools.runBackgroundProcess({ userId }),
          lspDiagnostics: daytonaTools.lspDiagnostics({ userId }),
          archiveSandbox: daytonaTools.archiveSandbox({ userId }),
        }
      : {}),

    // Browser tools for browser_operator
    ...(agentType === "browser_operator"
      ? {
          browserUseRunTask: browserUseTools.browserUseRunTask(),
          browserUseStartTask: browserUseTools.browserUseStartTask(),
          browserUseGetTask: browserUseTools.browserUseGetTask(),
          browserUseControlTask: browserUseTools.browserUseControlTask(),
          browserUseCreateSession: browserUseTools.browserUseCreateSession(),
          browserUseGetLiveUrl: browserUseTools.browserUseGetLiveUrl(),
          browserUseListTasks: browserUseTools.browserUseListTasks(),
          browserUseCheckCredits: browserUseTools.browserUseCheckCredits(),
          browserSetup: daytonaBrowserTools.browserSetup({ userId }),
          browserNavigate: daytonaBrowserTools.browserNavigate({ userId }),
          browserInteract: daytonaBrowserTools.browserInteract({ userId }),
          browserExtract: daytonaBrowserTools.browserExtract({ userId }),
          browserMultiTab: daytonaBrowserTools.browserMultiTab({ userId }),
          browserUploadFile: daytonaBrowserTools.browserUploadFile({ userId }),
          browserScreenshot: daytonaBrowserTools.browserScreenshot({ userId }),
          browserVisualInteract: daytonaBrowserTools.browserVisualInteract({ userId }),
        }
      : {}),

    // Twilio voice & SMS tools (available to all agents)
    twilioMakeCall: twilio.twilioMakeCall({ userId }),
    twilioGetCall: twilio.twilioGetCall({ userId }),
    twilioListCalls: twilio.twilioListCalls({ userId }),
    twilioModifyCall: twilio.twilioModifyCall({ userId }),
    twilioSendSMS: twilio.twilioSendSMS({ userId }),
    twilioGetMessage: twilio.twilioGetMessage({ userId }),
    twilioListMessages: twilio.twilioListMessages({ userId }),
    twilioListMyNumbers: twilio.twilioListMyNumbers({ userId }),
    twilioSearchAvailableNumbers: twilio.twilioSearchAvailableNumbers({ userId }),
    twilioProvisionNumber: twilio.twilioProvisionNumber({ userId }),
    twilioReleaseNumber: twilio.twilioReleaseNumber({ userId }),
    twilioUpdateNumber: twilio.twilioUpdateNumber({ userId }),
  };

  const memoryContext = await recallRelevantMemory(userId, task);

  const ATTACHMENT_DELIMITER = "###ATTACHMENTS###";
  let promptTask = task;
  const parsedAttachments: string[] = [];

  if (task.includes(ATTACHMENT_DELIMITER)) {
    const parts = task.split(ATTACHMENT_DELIMITER);
    promptTask = parts[0].trim();
    try {
      const urls = JSON.parse(parts[1].trim());
      if (Array.isArray(urls)) parsedAttachments.push(...urls);
    } catch {}
  }

  const systemPrompt = `${definition.systemPrompt}${memoryContext}

Today's date is ${new Date().toLocaleDateString()}.

## A2A Collaboration — Multi-Agent Orchestration

You have access to a powerful multi-agent collaboration system. Three tools let you spawn other specialized agents, wait for results, and synthesize their outputs into a unified answer.

### WHEN TO SPAWN
Spawn a child agent when:
1. The sub-task is clearly outside your domain (e.g., inbox_operator → sdr for sales opportunity)
2. You lack specialized tools or knowledge the other agent has
3. Parallelization saves time (spawn multiple agents simultaneously)
4. The user's task is inherently multi-disciplinary

DO NOT spawn when:
- You can handle the task yourself with your existing tools
- The task is too small to warrant delegation overhead
- You're uncertain which agent to spawn (ask for clarification or attempt the task yourself first)

### TOOL 1: spawnChildAgent({ agentType, task, coordinationId?, waitForResult? })
Spawn another agent immediately.

Parameters:
- agentType (required): The agent slug (e.g., "sdr", "competitive_intel", "inbox_operator", "browser_operator")
- task (required): Precise, self-contained task. Include all context the child needs—do NOT assume they have your conversation history.
- coordinationId (optional): Use this to group multiple spawns so you can collect all results together. Same coordinationId = same group.
- waitForResult (optional, default false): If true, this tool blocks for up to 8 minutes waiting for the child to complete and returns their result inline. Use for sequential workflows where one agent's output feeds another.

Returns: { success, taskId, coordinationId, childEventId, message }
The taskId and coordinationId are what you need to track and collect the result.

### TOOL 2: waitForChildAgents({ coordinationId, taskIds, timeoutMinutes? })
Wait for multiple spawned agents (with the same coordinationId) to complete and collect their results.

Use this in a parallel fan-out pattern:
1. spawnChildAgent({ agentType: "competitive_intel", task: "...", coordinationId: "coord-123" })
2. spawnChildAgent({ agentType: "sdr", task: "...", coordinationId: "coord-123" })
3. waitForChildAgents({ coordinationId: "coord-123", taskIds: ["task-1", "task-2"] })
4. Synthesize both results into one unified output.

Returns: { success, timedOut, receivedCount, expectedCount, allReceived, results: { taskId: result } }

⚠️ Max wait: 8 minutes. If you hit timeout, report partial results with transparency.

### TOOL 3: getCollaborationStatus({ coordinationId })
Non-blocking status check. See how many agents have completed without waiting. Useful for mid-task progress decisions.

Returns: { expected, received, complete }

### ORCHESTRATION PATTERNS

**PARALLEL FAN-OUT** (fastest, for independent tasks):
1. Spawn all agents simultaneously with same coordinationId
2. Immediately call waitForChildAgents to collect all results
3. Synthesize the unified answer

Example: User wants competitive analysis + outbound strategy
→ Spawn competitive_intel (research competitors)
→ Spawn sdr (draft outreach)
→ Wait for both
→ Combine into one strategic brief

**SEQUENTIAL** (when task B needs task A's output):
1. spawnChildAgent({ agentType: "A", task: "...", waitForResult: true })
2. Receive result from Agent A
3. spawnChildAgent({ agentType: "B", task: "...[use A's result]..." })
4. Receive result from Agent B

**CONDITIONAL BRANCHING**:
1. Spawn Agent A with waitForResult: true
2. Check Agent A's result
3. Based on result, spawn Agent B or Agent C

### SYNTHESIS IS MANDATORY
Never just concatenate child agent results. Your synthesis layer is critical:
1. Read all results carefully
2. Identify contradictions or overlaps
3. Create one coherent narrative
4. Add your own strategic layer (what should the user DO about this?)
5. Cite which agents contributed to each section
6. Flag any timeouts or failures explicitly

### HARD RULES & GUARDRAILS
- Never claim you ran analysis you didn't. Always cite the spawned agent.
- If a child agent fails, report the failure AND attempt an alternative approach.
- Do not exceed 7 minutes total orchestration time. If time is running short, report partial results with transparency.
- Always pass full context in the task parameter. Child agents have NO access to your conversation history.
- Never spawn the same agent twice for the same logical unit of work. If you need more from an agent, make the request more specific upfront.

### AGENT ROUTING QUICK REFERENCE
| Need | Agent | Best For |
|---|---|---|
| Email/calendar/inbox | inbox_operator | Triage, classification, urgent flagging |
| Outbound sales, lead gen | sdr | Cold outreach, prospecting, sequences |
| Morning brief, priorities | chief_of_staff | Daily briefings, stakeholder alignment |
| Competitor research | competitive_intel | Strategic intelligence, market positioning |
| Customer data, churn risk | customer_success | Retention, support triage, CS health |
| Financial overview | finance | Revenue, burn, forecasting, invoicing |
| Social media content | social_media | Content creation, engagement, brand voice |
| Code/deployment/testing | code_review, sandbox_specialist | PR review, testing, deployment |
| Web research, scraping | browser_operator | Deep research, real-time data, interactive sites |
| Hiring, recruiting | hiring | Job posting, screening, interview scheduling |

### EXPECTED FLOW (Example: "Give me a complete market entry strategy")
1. **Decompose**: "I need competitor intel + outbound plan + pricing analysis"
2. **Spawn parallel**: competitive_intel, sdr, finance (coordinationId: "strategy-001")
3. **Wait**: waitForChildAgents({ coordinationId: "strategy-001", taskIds: [...] })
4. **Receive**: 3 results in
5. **Synthesize**: Integrate all 3 into one cohesive strategy narrative
6. **Deliver**: "Here's your market entry playbook, combining competitive intel, pricing, and 50 target leads."

You now have the full capability to run truly multi-agent operations. Use this power strategically.

Execute the task now. Summarize what you did in your final response.`;

  const subagentModel = process.env.SUBAGENT_MODEL?.trim();
  const model =
    subagentModel && subagentModel.startsWith("google/")
      ? getGoogleModel(subagentModel)
      : getGoogleModel("google/gemini-3-flash-preview");

  try {
    const userContent: any[] = [{ type: "text", text: `Task: ${promptTask}` }];
    for (const url of parsedAttachments) {
      if (typeof url === "string") {
        if (url.match(/\.(png|jpe?g|gif|webp|bmp)$/i)) {
          userContent.push({ type: "image", image: new URL(url) });
        } else {
          userContent.push({ type: "file", data: new URL(url), mimeType: "application/octet-stream" });
        }
      }
    }

    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      tools,
      stopWhen: stepCountIs(25),
    });

    const resultPayload = {
      text: result.text,
      toolCalls: result.steps?.flatMap((s) => s.toolCalls ?? []),
    };

    await updateAgentTask({ id: taskId, userId, status: "completed", result: resultPayload });

    if (chatId) {
      const timestamp = new Date();
      const agentPayload = {
        agentType: definition.name,
        slug: agentType,
        task: promptTask,
        taskId,
        result: result.text,
        timestamp: timestamp.toISOString(),
      };

      await saveMessages({
        messages: [
          {
            id: generateUUID(),
            chatId,
            role: "assistant",
            parts: [{ type: "text", text: `###AGENT_RESULT###${JSON.stringify(agentPayload)}` }],
            attachments: [],
            createdAt: new Date(timestamp.getTime() + 1000),
          },
        ] as any,
      });

      notifySubAgentHandoffToMainAgent({
        chatId, userId, taskId,
        agentName: definition.name, slug: agentType,
        task: promptTask, outcome: "completed",
        summary: result.text || JSON.stringify(resultPayload),
      });
    }

    // ── A2A: notify parent workflow if this was a child agent ────────────────
    if (parentEventId) {
      await notifyParentAgent(parentEventId, {
        taskId, agentType,
        success: true,
        text: result.text,
        completedAt: new Date().toISOString(),
      }).catch((err) => {
        console.error("[SubAgent] Failed to notify parent:", err);
      });
    }

    return { success: true, text: result.text };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await updateAgentTask({ id: taskId, userId, status: "failed", result: { error: errMsg } });

    if (chatId) {
      const failPayload = {
        agentType: definition.name, slug: agentType, task: promptTask,
        taskId, error: errMsg, timestamp: new Date().toISOString(),
      };
      await saveMessages({
        messages: [
          {
            id: generateUUID(), chatId, role: "assistant",
            parts: [{ type: "text", text: `###AGENT_RESULT###${JSON.stringify(failPayload)}` }],
            attachments: [], createdAt: new Date(),
          },
        ] as any,
      });

      notifySubAgentHandoffToMainAgent({
        chatId, userId, taskId,
        agentName: definition.name, slug: agentType,
        task: promptTask, outcome: "failed", summary: errMsg,
      });
    }

    // ── A2A: notify parent even on failure ───────────────────────────────────
    if (parentEventId) {
      await notifyParentAgent(parentEventId, {
        taskId, agentType,
        success: false,
        error: errMsg,
        completedAt: new Date().toISOString(),
      }).catch(() => {});
    }

    return { success: false, error: errMsg };
  }
}