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

/** True when the Vercel AI Gateway is likely available (API key or platform OIDC). */
function isAiGatewayLikelyAvailable(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim() ||
      process.env.VERCEL_AI_GATEWAY_AUTH_TOKEN?.trim(),
  );
}

/**
 * Google Gemini ids in chat are normally routed through the AI Gateway.
 * When the gateway is not configured (or you set GEMINI_PREFER_GOOGLE_NATIVE),
 * use @ai-sdk/google with GOOGLE_GENERATIVE_AI_API_KEY so Gemini keeps working;
 * other providers still use the gateway when configured.
 */
function shouldRouteGeminiThroughGateway(modelId: string): boolean {
  if (!modelId.startsWith("google/")) {
    return true;
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
    return true;
  }
  if (process.env.GEMINI_PREFER_GOOGLE_NATIVE === "true") {
    return false;
  }
  return isAiGatewayLikelyAvailable();
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

export function getLanguageModel(modelId: string): LanguageModel {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  const isReasoningModel =
    modelId.endsWith("-thinking") ||
    (modelId.includes("reasoning") && !modelId.includes("non-reasoning"));

  if (isReasoningModel) {
    const gatewayModelId = modelId
      .replace(THINKING_SUFFIX_REGEX, "")
      .replace("-reasoning", "");

    if (
      gatewayModelId.startsWith("google/") &&
      !shouldRouteGeminiThroughGateway(gatewayModelId)
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

  if (!shouldRouteGeminiThroughGateway(modelId)) {
    return getGoogleModel(modelId);
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

export function getTitleModel(): LanguageModel {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  const titleId = "google/gemini-2.5-flash-lite";
  if (!shouldRouteGeminiThroughGateway(titleId)) {
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
