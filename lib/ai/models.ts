// Curated list of top models from Vercel AI Gateway
// lib/ai/models.ts

export const DEFAULT_CHAT_MODEL = "google/gemini-2.0-flash";

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
  capabilities?: {
    reasoning?: boolean;
    vision?: boolean;
    tools?: boolean;
  };
};

export const chatModels: ChatModel[] = [
  // Anthropic
  {
    id: "anthropic/claude-3-7-sonnet-20250219",
    name: "Claude 3.7 Sonnet",
    provider: "anthropic",
    description: "Most intelligent model with hybrid reasoning capabilities",
    capabilities: { reasoning: true, vision: true, tools: true },
  },
  {
    id: "anthropic/claude-3-5-sonnet-latest",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    description: "High performance and industry-leading intelligence",
    capabilities: { vision: true, tools: true },
  },
  {
    id: "anthropic/claude-3-5-haiku-latest",
    name: "Claude 3.5 Haiku",
    provider: "anthropic",
    description: "Fastest model for near-instant responses",
    capabilities: { tools: true },
  },
  // OpenAI
  {
    id: "openai/o3-mini",
    name: "o3-mini",
    provider: "openai",
    description: "Small, fast reasoning model",
    capabilities: { reasoning: true, tools: true },
  },
  {
    id: "openai/o1",
    name: "o1",
    provider: "openai",
    description: "Advanced reasoning for complex problem solving",
    capabilities: { reasoning: true, vision: true, tools: true },
  },
  {
    id: "openai/gpt-4.5-preview",
    name: "GPT-4.5 Preview",
    provider: "openai",
    description: "Latest frontier model from OpenAI",
    capabilities: { vision: true, tools: true },
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "Omni model for text and vision",
    capabilities: { vision: true, tools: true },
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o mini",
    provider: "openai",
    description: "Fast and cost-effective for simple tasks",
    capabilities: { vision: true, tools: true },
  },
  // Google
  {
    id: "google/gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    description: "Fast and extremely capable multimodal model",
    capabilities: { vision: true, tools: true },
  },
  {
    id: "google/gemini-2.0-pro-exp-02-05",
    name: "Gemini 2.0 Pro",
    provider: "google",
    description: "Most capable Google model for complex reasoning",
    capabilities: { reasoning: true, vision: true, tools: true },
  },
  // DeepSeek
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek V3",
    provider: "deepseek",
    description: "Highly capable open-weights model",
    capabilities: { tools: true },
  },
  {
    id: "deepseek/deepseek-reasoner",
    name: "DeepSeek R1",
    provider: "deepseek",
    description: "Powerful reasoning model (R1)",
    capabilities: { reasoning: true },
  },
  // xAI
  {
    id: "xai/grok-3",
    name: "Grok 3",
    provider: "xai",
    description: "Latest Grok model with frontier intelligence",
    capabilities: { reasoning: true, vision: true, tools: true },
  },
  {
    id: "xai/grok-2-1212",
    name: "Grok 2",
    provider: "xai",
    description: "Stable Grok model with real-time knowledge",
    capabilities: { tools: true },
  },
  // Minimax
  {
    id: "minimax/minimax-01",
    name: "Minimax-01",
    provider: "minimax",
    description: "Next generation high-performance model",
    capabilities: { tools: true },
  },
  // ZAI / GLM
  {
    id: "zai/glm-4",
    name: "GLM-4",
    provider: "zai",
    description: "High performance bilingual model",
    capabilities: { vision: true, tools: true },
  },
  // Perplexity
  {
    id: "perplexity/sonar-reasoning",
    name: "Sonar Reasoning",
    provider: "perplexity",
    description: "Search-augmented reasoning model",
    capabilities: { reasoning: true },
  },
  // Reasoning models (extended thinking grouped for UI)
  {
    id: "reasoning/claude-3-7-thinking",
    name: "Claude 3.7 (Thinking Mode)",
    provider: "reasoning",
    description: "Extended thinking for complex problems",
    capabilities: { reasoning: true, vision: true, tools: true },
  },
  {
    id: "reasoning/o1-thinking",
    name: "o1 (Full Reasoning)",
    provider: "reasoning",
    description: "OpenAI o1 with maximum reasoning depth",
    capabilities: { reasoning: true, vision: true, tools: true },
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
