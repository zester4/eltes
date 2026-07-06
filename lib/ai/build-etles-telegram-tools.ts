/**
 * Tool set for Telegram AI paths (workflow + inline fallback).
 * Mirrors the web chat agent's core tools (memory, search, schedule, sandbox, etc.)
 * so behaviour stays consistent across surfaces.
 * lib/ai/build-etles-telegram-tools.ts
 */

import type { ToolSet } from "ai";
import * as browserUseTools from "@/lib/ai/tools/browser-use";
import {
  archiveSandbox,
  createDirectory,
  createSandbox,
  deleteSandbox,
  executeCommand,
  getPreviewLink,
  gitBranch,
  gitClone,
  gitCommit,
  gitPull,
  gitPush,
  gitStatus,
  listFiles,
  listSandboxes,
  lspDiagnostics,
  readFile,
  replaceInFiles,
  runBackgroundProcess,
  runCode,
  searchFiles,
  writeFile,
} from "@/lib/ai/tools/daytona";
import * as daytonaBrowserTools from "@/lib/ai/tools/daytona-browser";
import { getWeather } from "@/lib/ai/tools/get-weather";
import {
  addGoal,
  deleteGoal,
  listGoals,
  logGoalProgress,
  updateGoal,
} from "@/lib/ai/tools/goals";
import {
  addKnowledgeRelation,
  deleteKnowledgeEntity,
  deleteKnowledgeRelation,
  getKnowledgeEntity,
  searchKnowledgeGraph,
  upsertKnowledgeEntity,
} from "@/lib/ai/tools/knowledge-graph";
import {
  deleteMemory,
  recallMemory,
  saveMemory,
  updateMemory,
} from "@/lib/ai/tools/memory";
import { getMissionStatus, launchMission } from "@/lib/ai/tools/missions";
import { allOracleTools } from "@/lib/ai/tools/oracle-cloud";
import { getPersistentSandboxTools } from "@/lib/ai/tools/persistent-sandbox";
import {
  activateHeartbeat,
  getAgentSystemStatus,
  setMorningBriefingTime,
} from "@/lib/ai/tools/proactive";
import { queueApproval } from "@/lib/ai/tools/queue-approval";
import {
  deleteSchedule,
  listSchedules,
  setCronJob,
  setReminder,
} from "@/lib/ai/tools/schedule";
import { searchPastConversations } from "@/lib/ai/tools/search-history";
import {
  delegateToSubAgent,
  getSubAgentResult,
  listSubAgents,
} from "@/lib/ai/tools/subagents";
import {
  tavilyCrawl,
  tavilyExtract,
  tavilyMap,
  tavilySearch,
} from "@/lib/ai/tools/tavily-search";
import {
  listActiveTriggers,
  removeTrigger,
  setupTrigger,
} from "@/lib/ai/tools/triggers";
import * as twilio from "@/lib/ai/tools/twilio";
import * as twilioWhatsApp from "@/lib/ai/tools/twilio-whatsapp";
import { wikiIngest, wikiQuery } from "@/lib/ai/tools/wiki";

export type TelegramEtlesToolsParams = {
  userId: string;
  chatId: string;
  baseUrl: string;
  composioTools: Record<string, unknown>;
};

export function buildEtlesTelegramTools({
  userId,
  chatId,
  baseUrl,
  composioTools,
}: TelegramEtlesToolsParams): ToolSet {
  return {
    ...composioTools,
    getWeather,
    saveMemory: saveMemory({ userId }),
    recallMemory: recallMemory({ userId }),
    searchPastConversations: searchPastConversations({ userId }),
    updateMemory: updateMemory({ userId }),
    deleteMemory: deleteMemory({ userId }),
    setReminder: setReminder({ userId, baseUrl }),
    setCronJob: setCronJob({ userId, baseUrl }),
    listSchedules: listSchedules({ userId }),
    deleteSchedule: deleteSchedule(),
    setupTrigger: setupTrigger({ userId }),
    listActiveTriggers: listActiveTriggers({ userId }),
    removeTrigger: removeTrigger(),
    delegateToSubAgent: delegateToSubAgent({
      userId,
      chatId,
      baseUrl,
    }),
    getSubAgentResult: getSubAgentResult({ userId }),
    listSubAgents: listSubAgents(),
    launchMission: launchMission({ userId, chatId, baseUrl }),
    getMissionStatus: getMissionStatus({ userId }),
    activateHeartbeat: activateHeartbeat({ userId, baseUrl }),
    getAgentSystemStatus: getAgentSystemStatus({ userId }),
    setMorningBriefingTime: setMorningBriefingTime({ userId, baseUrl }),
    queueApproval: queueApproval({ userId, chatId, skipTelegram: false }),
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
    wikiQuery: wikiQuery({ userId }),
    wikiIngest: wikiIngest({ userId }),
    createSandbox: createSandbox({ userId }),
    listSandboxes: listSandboxes({ userId }),
    deleteSandbox: deleteSandbox({ userId }),
    executeCommand: executeCommand({ userId }),
    runCode: runCode({ userId }),
    listFiles: listFiles({ userId }),
    readFile: readFile({ userId }),
    writeFile: writeFile({ userId }),
    createDirectory: createDirectory({ userId }),
    searchFiles: searchFiles({ userId }),
    replaceInFiles: replaceInFiles({ userId }),
    gitClone: gitClone({ userId }),
    gitStatus: gitStatus({ userId }),
    gitCommit: gitCommit({ userId }),
    gitPush: gitPush({ userId }),
    gitPull: gitPull({ userId }),
    gitBranch: gitBranch({ userId }),
    getPreviewLink: getPreviewLink({ userId }),
    runBackgroundProcess: runBackgroundProcess({ userId }),
    lspDiagnostics: lspDiagnostics({ userId }),
    archiveSandbox: archiveSandbox({ userId }),
    // Persistent Sandbox
    ...getPersistentSandboxTools({ userId }),
    twilioMakeCall: twilio.twilioMakeCall({ userId }),
    twilioGetCall: twilio.twilioGetCall({ userId }),
    twilioListCalls: twilio.twilioListCalls({ userId }),
    twilioModifyCall: twilio.twilioModifyCall({ userId }),
    twilioSendSMS: twilio.twilioSendSMS({ userId }),
    twilioGetMessage: twilio.twilioGetMessage({ userId }),
    twilioListMessages: twilio.twilioListMessages({ userId }),
    twilioListMyNumbers: twilio.twilioListMyNumbers({ userId }),
    twilioSearchAvailableNumbers: twilio.twilioSearchAvailableNumbers({
      userId,
    }),
    twilioProvisionNumber: twilio.twilioProvisionNumber({ userId }),
    twilioReleaseNumber: twilio.twilioReleaseNumber({ userId }),
    twilioUpdateNumber: twilio.twilioUpdateNumber({ userId }),
    // Twilio WhatsApp Tools
    twilioWhatsAppSendMessage: twilioWhatsApp.twilioWhatsAppSendMessage({
      userId,
    }),
    twilioWhatsAppGetMessage: twilioWhatsApp.twilioWhatsAppGetMessage({
      userId,
    }),
    twilioWhatsAppListMessages: twilioWhatsApp.twilioWhatsAppListMessages({
      userId,
    }),
    twilioWhatsAppSendTemplate: twilioWhatsApp.twilioWhatsAppSendTemplate({
      userId,
    }),
    twilioWhatsAppCreateTemplate: twilioWhatsApp.twilioWhatsAppCreateTemplate({
      userId,
    }),
    twilioWhatsAppListTemplates: twilioWhatsApp.twilioWhatsAppListTemplates({
      userId,
    }),
    twilioWhatsAppGetTemplate: twilioWhatsApp.twilioWhatsAppGetTemplate({
      userId,
    }),
    twilioWhatsAppDeleteTemplate: twilioWhatsApp.twilioWhatsAppDeleteTemplate({
      userId,
    }),
    twilioWhatsAppSubmitApproval: twilioWhatsApp.twilioWhatsAppSubmitApproval({
      userId,
    }),
    twilioWhatsAppGetApprovalStatus:
      twilioWhatsApp.twilioWhatsAppGetApprovalStatus({ userId }),
    twilioWhatsAppListSenders: twilioWhatsApp.twilioWhatsAppListSenders({
      userId,
    }),
    twilioGetUsage: twilio.twilioGetMessage({ userId }),
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
    browserVisualInteract: daytonaBrowserTools.browserVisualInteract({
      userId,
    }),
    ...allOracleTools({ userId }),
  } as ToolSet;
}
