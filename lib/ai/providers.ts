//lib/ai/providers.ts
import { gateway } from "@ai-sdk/gateway";
import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";

const THINKING_SUFFIX_REGEX = /-thinking$/;

function hasAiGatewayApiKey(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
}

function hasGoogleGenerativeAiKey(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim());
}

/** Chat / title model ids that map to Google’s Generative Language API (`google/...`). */
function isGoogleGenerativeLanguageModelId(modelId: string): boolean {
  return modelId.startsWith("google/");
}

/**
 * Google chat models are usually called through the AI Gateway (`AI_GATEWAY_API_KEY`).
 * When the gateway is out of credits but `GOOGLE_GENERATIVE_AI_API_KEY` is set, set
 * `GEMINI_USE_GOOGLE_GENERATIVE_AI=true` to route all `google/*` ids (including Gemma
 * and Gemini 3 / 3.1 previews) through `@ai-sdk/google` instead. Unset it to use the
 * gateway again. Non-Google models always use the gateway.
 */
function shouldUseGatewayForGoogleModel(modelId: string): boolean {
  if (!isGoogleGenerativeLanguageModelId(modelId)) {
    return true;
  }
  if (!hasGoogleGenerativeAiKey()) {
    return true;
  }
  if (process.env.GEMINI_USE_GOOGLE_GENERATIVE_AI === "true") {
    return false;
  }
  return hasAiGatewayApiKey();
}

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        artifactModel,
        chatModel,
        reasoningModel,
        titleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "chat-model-reasoning": reasoningModel,
          "title-model": titleModel,
          "artifact-model": artifactModel,
        },
      });
    })()
  : null;

function isExtendedThinkingChatModel(modelId: string): boolean {
  return (
    modelId.endsWith("-thinking") ||
    (modelId.includes("reasoning") && !modelId.includes("non-reasoning")) ||
    modelId === "google/gemini-3.1-pro-preview"
  );
}

export function getLanguageModel(modelId: string): LanguageModel {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  if (isExtendedThinkingChatModel(modelId)) {
    const gatewayModelId = modelId
      .replace(THINKING_SUFFIX_REGEX, "")
      .replace("-reasoning", "");

    if (
      isGoogleGenerativeLanguageModelId(gatewayModelId) &&
      !shouldUseGatewayForGoogleModel(gatewayModelId)
    ) {
      return wrapLanguageModel({
        model: getGoogleModel(gatewayModelId),
        middleware: extractReasoningMiddleware({ tagName: "thinking" }),
      });
    }

    return wrapLanguageModel({
      model: gateway.languageModel(gatewayModelId),
      middleware: extractReasoningMiddleware({ tagName: "thinking" }),
    });
  }

  if (
    isGoogleGenerativeLanguageModelId(modelId) &&
    !shouldUseGatewayForGoogleModel(modelId)
  ) {
    return getGoogleModel(modelId);
  }

  return gateway.languageModel(modelId);
}

/**
 * Returns a direct Google Generative AI model (no gateway).
 * Used for SuperMode, sub-agents, scheduled jobs, and orchestration synthesis.
 */
export function getGoogleModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  const directId = modelId.replace(/^google\//, "");

  return google(directId);
}

export function getTitleModel(): LanguageModel {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  const titleId = "google/gemini-2.5-flash-lite";
  if (!shouldUseGatewayForGoogleModel(titleId)) {
    return getGoogleModel(titleId);
  }
  return gateway.languageModel(titleId);
}

export function getArtifactModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("artifact-model");
  }
  return gateway.languageModel("anthropic/claude-haiku-4.5");
}
