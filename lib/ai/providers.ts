// lib/ai/providers.ts
import { gateway } from "@ai-sdk/gateway";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
  type LanguageModelV1,
} from "ai";
import { isTestEnvironment } from "../constants";

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

export function getLanguageModel(modelId: string): LanguageModelV1 {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  // Handle special "reasoning" group IDs from models.ts
  if (modelId === "reasoning/claude-3-7-thinking") {
    return wrapLanguageModel({
      model: gateway.languageModel("anthropic/claude-3-7-sonnet-20250219", {
        providerOptions: {
          anthropic: {
            thinking: { type: "enabled", budgetTokens: 12000 },
          },
        },
      } as any),
      middleware: extractReasoningMiddleware({ tagName: "thinking" }),
    });
  }

  if (modelId === "reasoning/o1-thinking") {
    return gateway.languageModel("openai/o1");
  }

  const isReasoningModel =
    modelId.endsWith("-thinking") ||
    modelId.includes("reasoning") ||
    modelId.includes("deepseek-reasoner") ||
    modelId.startsWith("openai/o") ||
    modelId.includes("o3-mini");

  // Diagnostic log for model selection
  console.log(`[AI SDK] Using model: ${modelId} (reasoning: ${isReasoningModel})`);

  if (isReasoningModel) {
    // We wrap with reasoning middleware to extract thinking blocks if present.
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
  return gateway.languageModel("google/gemini-2.0-flash-lite");
}

/**
 * Returns a model safe for structured output (streamObject / generateObject).
 */
export function getArtifactModel(_modelId?: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("artifact-model");
  }

  // Always use the stable, structured-output-safe model for artifacts.
  return gateway.languageModel("google/gemini-2.0-flash");
}
