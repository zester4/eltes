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
  console.log(
    `[AI SDK] Using model: ${modelId} (reasoning: ${isReasoningModel})`
  );

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

/**
 * Returns a model safe for structured output (streamObject / generateObject).
 *
 * IMPORTANT: We intentionally IGNORE the user's chat modelId here.
 * The reasons:
 * 1. Thinking/reasoning models (Gemini thinking, Claude extended thinking, DeepSeek
 *    thinking) are INCOMPATIBLE with streamObject structured output — they produce
 *    "Corrupted thought signature" and similar errors.
 * 2. OpenAI models with strict JSON schema validation reject `z.record()` with
 *    optional properties (the styles field), causing 400 errors.
 * 3. Artifact generation needs a fast, reliable, consistent model — not the most
 *    powerful one the user happens to have selected for chat.
 *
 * We always use Gemini 3 Flash Preview as the artifact model. It:
 * - Supports streamObject with complex schemas reliably
 * - Is fast and cost-efficient
 * - Does not have corrupted thinking mode issues
 */
export function getArtifactModel(_modelId?: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("artifact-model");
  }

  // Always use the stable, structured-output-safe model for artifacts.
  // Never inherit the user's chat model here.
  return gateway.languageModel("google/gemini-3-flash-preview");
}
