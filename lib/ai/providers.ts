//lib/ai/providers.ts
import { gateway } from "@ai-sdk/gateway";
import { google } from "@ai-sdk/google";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";

const THINKING_SUFFIX_REGEX = /-thinking$/;

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

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  const isReasoningModel =
    modelId.endsWith("-thinking") ||
    (modelId.includes("reasoning") && !modelId.includes("non-reasoning"));

  // Diagnostic log for model selection
  console.log(`[AI SDK] Using model: ${modelId} (reasoning: ${isReasoningModel})`);

  if (isReasoningModel) {
    // We wrap with reasoning middleware to extract thinking blocks if present.
    // We pass the FULL modelId to the gateway to ensure correct routing.
    return wrapLanguageModel({
      model: gateway.languageModel(modelId),
      middleware: extractReasoningMiddleware({ tagName: "thinking" }),
    });
  }

  return gateway.languageModel(modelId);
}

/**
 * Returns a direct Google Gemini model, bypassing the AI Gateway.
 * Used for subagents and critical background tasks for maximum reliability.
 */
export function getGoogleModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  // Remove provider prefix if present (e.g., google/gemini-2.0-flash -> gemini-2.0-flash)
  const directId = modelId.replace(/^google\//, "");

  return google(directId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return gateway.languageModel("google/gemini-2.5-flash-lite");
}

export function getArtifactModel(modelId?: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("artifact-model");
  }

  if (modelId) {
    return getLanguageModel(modelId);
  }

  return gateway.languageModel("google/gemini-3-flash-preview");
}
