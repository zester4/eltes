// Curated list of top models from Vercel AI Gateway
//lib/ai/models.ts
//
// Gemini + gateway: set GOOGLE_GENERATIVE_AI_API_KEY. If the gateway is missing or
// unusable, omit AI_GATEWAY / OIDC vars or set GEMINI_PREFER_GOOGLE_NATIVE=true so
// `getLanguageModel` routes `google/*` ids through @ai-sdk/google (see providers.ts).
export const DEFAULT_CHAT_MODEL = "google/gemini-3-flash-preview";

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
};

export const chatModels: ChatModel[] = [
  // Anthropic
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    description: "Fast and affordable, great for everyday tasks",
  },
  // OpenAI
  {
    id: "openai/gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    provider: "openai",
    description: "Fast and cost-effective for simple tasks",
  },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    provider: "openai",
    description: "Most capable OpenAI model",
  },
  {
    id: "openai/gpt-5-nano",
    name: "GPT-5 Nano",
    provider: "openai",
    description: "Ultra-compact high speed model",
  },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    provider: "openai",
    description: "Open source large scale model",
  },
  // Google
  {
    id: "google/gemini-3-flash-preview",
    name: "Gemini 3 Flash",
    provider: "google",
    description: "Ultra fast and affordable",
  },
  {
    id: "google/gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash Lite",
    provider: "google",
    description: "Latest lightweight preview model",
  },
  {
    id: "google/gemma-4-26b-a4b-it",
    name: "Gemma 4 26B",
    provider: "google",
    description: "Gemma 4 open weights model",
  },
  // DeepSeek
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "deepseek",
    description: "Powerful open-source model",
  },
  // Perplexity
  {
    id: "perplexity/sonar",
    name: "Sonar",
    provider: "perplexity",
    description: "Search-augmented model",
  },
  // NVIDIA
  {
    id: "nvidia/nemotron-3-nano-30b-a3b",
    name: "Nemotron 3 Nano",
    provider: "nvidia",
    description: "Compact efficient model",
  },
  // MoonshotAI
  {
    id: "moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    provider: "moonshotai",
    description: "Next generation Kimi model",
  },
  // Minimax
  {
    id: "minimax/minimax-m2.5",
    name: "Minimax M2.5",
    provider: "minimax",
    description: "Standard M2.5 performance",
  },
  {
    id: "minimax/minimax-m2.5-highspeed",
    name: "Minimax M2.5 Speed",
    provider: "minimax",
    description: "Optimized for extreme speed",
  },
  {
    id: "minimax/minimax-m2.7",
    name: "Minimax M2.7",
    provider: "minimax",
    description: "Advanced multi-modal capabilities",
  },
  // ZAI
  {
    id: "zai/glm-5",
    name: "GLM-5",
    provider: "zai",
    description: "High performance GLM model",
  },
  // xAI
  {
    id: "xai/grok-4.1-fast-non-reasoning",
    name: "Grok 4.1 Fast",
    provider: "xai",
    description: "Fast with 30K context",
  },
  // Reasoning models (extended thinking)
  {
    id: "google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    provider: "reasoning",
    description: "Google reasoning preview",
  },
  {
    id: "deepseek/deepseek-v3.2-thinking",
    name: "DeepSeek V3.2 Thinking",
    provider: "reasoning",
    description: "DeepSeek extended thinking",
  },
  {
    id: "anthropic/claude-3.7-sonnet-thinking",
    name: "Claude 3.7 Sonnet",
    provider: "reasoning",
    description: "Extended thinking for complex problems",
  },
  {
    id: "moonshotai/kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    provider: "reasoning",
    description: "Moonshot reasoning model",
  },
  {
    id: "xai/grok-code-fast-1-thinking",
    name: "Grok Code Fast",
    provider: "reasoning",
    description: "Reasoning optimized for code",
  },
  {
    id: "xai/grok-4.1-fast-reasoning",
    name: "Grok 4.1 Reasoning",
    provider: "reasoning",
    description: "Reasoning-enabled Grok 4.1",
  },
];

// Group models by provider for UI
export const allowedModelIds = new Set(chatModels.map((m) => m.id));

export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);
