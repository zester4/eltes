/**

- INTEGRATION_GUIDE.md
- 
- HOW TO WIRE ALL THE NEW FILES INTO THE EXISTING CODEBASE
- =========================================================
- 
- 5 critical changes to existing files. Everything else is new files
- that don't touch existing code.
 */

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE 1: lib/workflow/client.ts
// ═══════════════════════════════════════════════════════════════════════════
// REPLACE the entire file with the new outputs/lib/workflow/client.ts
// This adds: triggerHeartbeatWorkflow, triggerWeeklySynthesisWorkflow,
//            triggerMorningBriefingWorkflow, triggerCollaborationWorkflow
// FIXES: the heartbeat that was silently doing nothing

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE 2: lib/agent/subagent-definitions.ts — ADD task_coordinator
// ═══════════════════════════════════════════════════════════════════════════

// Step 1: Add to AgentSlug union (around line 30):
/*
  | "task_coordinator"
*/

// Step 2: Import the definition:
/*
  import { TASK_COORDINATOR_DEFINITION } from "./task-coordinator-definition";
*/

// Step 3: Add to SUBAGENT_DEFINITIONS array (before the closing bracket):
/*
  TASK_COORDINATOR_DEFINITION,
*/

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE 3: lib/agent/subagent-runner.ts
// ═══════════════════════════════════════════════════════════════════════════
// REPLACE the entire file with outputs/lib/agent/subagent-runner.ts
// This adds: collaboration tools to all agents + A2A parent notification

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE 4: app/api/agent/workflow/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// REPLACE with outputs/app/api/agent/workflow/route.ts
// This adds: parentEventId support + notifyParentAgent() call on completion

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE 5: app/(chat)/api/chat/route.ts — ADD proactive tools to main agent
// ═══════════════════════════════════════════════════════════════════════════

// Step 1: Add imports at the top (after existing tool imports):
/*
  import {
    activateHeartbeat,
    getAgentSystemStatus,
    setMorningBriefingTime,
  } from "@/lib/ai/tools/proactive";
*/

// Step 2: Add to experimental_activeTools array (after "queueApproval"):
/*
  "activateHeartbeat",
  "getAgentSystemStatus",
  "setMorningBriefingTime",
*/

// Step 3: Add to tools object (after queueApproval in the isGuest ? {} : {} block):
/*
  activateHeartbeat: activateHeartbeat({
    userId: session.user.id!,
    baseUrl: process.env.BASE_URL || new URL(request.url).origin,
  }),
  getAgentSystemStatus: getAgentSystemStatus({ userId: session.user.id! }),
  setMorningBriefingTime: setMorningBriefingTime({
    userId: session.user.id!,
    baseUrl: process.env.BASE_URL || new URL(request.url).origin,
  }),
*/

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE 6: lib/agent/subagent-definitions.ts — UPDATE onboarding_specialist
// ═══════════════════════════════════════════════════════════════════════════
// In the onboarding_specialist systemPrompt, find the FINALIZATION section
// and update it to call activateHeartbeat after saving onboarding_complete:

/*
  ORIGINAL (in systemPrompt):
  "**CRITICAL FINAL ACTION:** You MUST call 'saveMemory' with key 'onboarding_complete'..."

  UPDATED:
  "**CRITICAL FINAL ACTIONS (in order):**

1. Call 'saveMemory' with key 'onboarding_complete' and content 'Guided setup finished.'
2. Call 'activateHeartbeat' with morningHour set to the user's preferred morning time
(converted to UTC — default to 7 if they didn't specify).
  This activates the hourly intelligence scan, weekly brief, and morning briefing.
  Confirm to the user: 'Your background intelligence agents are now active. I'll brief
  you every morning and reach out when something urgent needs your attention.'"
*/

// ═══════════════════════════════════════════════════════════════════════════
// NEW ROUTES TO CREATE
// ═══════════════════════════════════════════════════════════════════════════
/*
  app/api/agent/heartbeat/activate/route.ts          ✓ in outputs (public, session-auth)
  app/api/agent/heartbeat/activate/internal/route.ts ✓ in outputs (internal, secret-auth)
  app/api/agent/morning/workflow/route.ts             ✓ in outputs
  lib/workflow/client.ts                              ✓ in outputs (replace existing)
  lib/agent/agent-bus.ts                              ✓ in outputs (new file)
  lib/ai/tools/proactive.ts                          ✓ in outputs (new file)
  lib/ai/tools/collaborate.ts                        ✓ in outputs (new file)
  lib/agent/subagent-runner.ts                       ✓ in outputs (replace existing)
  app/api/agent/workflow/route.ts                    ✓ in outputs (replace existing)
  lib/agent/task-coordinator-definition.ts           ✓ in outputs (new file)
*/

// ═══════════════════════════════════════════════════════════════════════════
// TESTING THE HEARTBEAT FIX
// ═══════════════════════════════════════════════════════════════════════════
/*
  After deploying client.ts fix, test the heartbeat manually:

  curl -X POST [https://your-app.vercel.app/api/agent/heartbeat](https://your-app.vercel.app/api/agent/heartbeat)   
    -H "Content-Type: application/json"   
    -H "x-heartbeat-secret: your-AGENT_DELEGATE_SECRET"   
    -d '{"userId": "YOUR_USER_UUID"}'

  Expected response: { "ok": true, "type": "heartbeat" }
  Then check Upstash console — you should see a new Workflow run.
*/

// ═══════════════════════════════════════════════════════════════════════════
// TESTING A2A COLLABORATION
// ═══════════════════════════════════════════════════════════════════════════
/*
  From the chat, try:
  "Delegate this to the task_coordinator: I need a competitive analysis of our top 3
   competitors AND 10 personalized outbound emails targeting their unhappy enterprise
   customers. Run both in parallel and give me a unified report."

  The coordinator should:

1. Spawn competitive_intel with a specific research task
2. Spawn sdr with a parallel outreach task
3. Wait for both to complete
4. Synthesize results into one report
*/

export {};