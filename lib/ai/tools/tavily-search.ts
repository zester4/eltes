import { tool } from "ai";
import { z } from "zod";

// ─── Tavily REST helpers ──────────────────────────────────────────────────────
//
// All four Tavily endpoints are called directly via fetch so there is no extra
// SDK dependency.  Set TAVILY_API_KEY in your environment.
//
// Pricing summary (credits):
//   Search  – basic: 1/req  | advanced: 2/req
//   Extract – basic: 1/5 successful URLs  | advanced: 2/5 successful URLs
//   Crawl   – 1/10 pages (2/10 when instructions provided)
//   Map     – 1/10 pages (2/10 when instructions provided)

const TAVILY_BASE = "https://api.tavily.com";

function tavilyHeaders() {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY environment variable is not set.");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}

async function tavilyPost<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TAVILY_BASE}${endpoint}`, {
    method: "POST",
    headers: tavilyHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Tavily ${endpoint} failed (${res.status}): ${err}`);
  }

  return res.json() as Promise<T>;
}

// ─── tavilySearch ─────────────────────────────────────────────────────────────

export const tavilySearch = tool({
  description:
    "Search the web in real-time using Tavily's AI-optimised search engine. " +
    "Returns ranked, relevant results with snippets and optional LLM-generated answers. " +
    "Use for factual lookups, current events, news, finance data, and general research. " +
    "Supports domain filtering, time ranges, image results, and raw page content.",

  inputSchema: z.object({
    query: z
      .string()
      .describe("The search query to run."),

    search_depth: z
      .enum(["basic", "advanced"])
      .optional()
      .default("basic")
      .describe(
        "'basic' (1 credit) returns generic snippets. " +
        "'advanced' (2 credits) uses AI to surface the most relevant content."
      ),

    topic: z
      .enum(["general", "news", "finance"])
      .optional()
      .default("general")
      .describe(
        "Search category. 'news' unlocks publishedDate per result and the 'days' filter. " +
        "'finance' targets financial data sources."
      ),

    max_results: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(5)
      .describe("Number of results to return (1–20)."),

    time_range: z
      .enum(["day", "week", "month", "year", "d", "w", "m", "y"])
      .optional()
      .describe("Restrict results to a rolling time window relative to today."),

    start_date: z
      .string()
      .optional()
      .describe("Return results published on or after this date (YYYY-MM-DD)."),

    end_date: z
      .string()
      .optional()
      .describe("Return results published on or before this date (YYYY-MM-DD)."),

    days: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "Only when topic='news'. Number of days back from today to include. Default 7."
      ),

    chunks_per_source: z
      .number()
      .int()
      .min(1)
      .max(3)
      .optional()
      .describe(
        "Number of content chunks (≤500 chars each) per source. " +
        "Only available when search_depth='advanced'."
      ),

    include_answer: z
      .union([z.boolean(), z.enum(["basic", "advanced"])])
      .optional()
      .default(false)
      .describe(
        "Include an LLM-generated answer. true/'basic' is fast; 'advanced' is more thorough."
      ),

    include_raw_content: z
      .union([z.boolean(), z.enum(["markdown", "text"])])
      .optional()
      .default(false)
      .describe(
        "Include cleaned full-page content in each result. " +
        "true/'markdown' returns Markdown; 'text' returns plain text (slower)."
      ),

    include_images: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include query-related images in the response."),

    include_image_descriptions: z
      .boolean()
      .optional()
      .default(false)
      .describe("Add LLM-generated descriptions to each returned image."),

    include_domains: z
      .array(z.string())
      .optional()
      .describe("Allowlist: only return results from these domains (max 300)."),

    exclude_domains: z
      .array(z.string())
      .optional()
      .describe("Blocklist: exclude results from these domains (max 150)."),

    country: z
      .string()
      .optional()
      .describe(
        "Boost results from a specific country (ISO 3166-1 alpha-2, e.g. 'us'). " +
        "Only applies when topic='general'."
      ),

    exact_match: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Force results to contain the exact quoted phrase(s) in the query verbatim."
      ),

    include_favicon: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include a favicon URL with each result."),

    include_usage: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include API credit usage in the response."),
  }),

  execute: async (params) => {
    try {
      const body: Record<string, unknown> = {
        query: params.query,
        search_depth: params.search_depth,
        topic: params.topic,
        max_results: params.max_results,
        include_answer: params.include_answer,
        include_raw_content: params.include_raw_content,
        include_images: params.include_images,
        include_image_descriptions: params.include_image_descriptions,
        include_favicon: params.include_favicon,
        include_usage: params.include_usage,
        exact_match: params.exact_match,
      };

      if (params.time_range)    body.time_range    = params.time_range;
      if (params.start_date)    body.start_date    = params.start_date;
      if (params.end_date)      body.end_date      = params.end_date;
      if (params.days != null)  body.days          = params.days;
      if (params.chunks_per_source != null) body.chunks_per_source = params.chunks_per_source;
      if (params.include_domains?.length)   body.include_domains   = params.include_domains;
      if (params.exclude_domains?.length)   body.exclude_domains   = params.exclude_domains;
      if (params.country)       body.country       = params.country;

      const data = await tavilyPost<Record<string, unknown>>("/search", body);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

// ─── tavilyExtract ────────────────────────────────────────────────────────────

export const tavilyExtract = tool({
  description:
    "Extract clean, LLM-ready content from one or more URLs using Tavily Extract. " +
    "Handles JavaScript-heavy pages, returns Markdown or plain text, and optionally " +
    "pulls images. Up to 20 URLs per call. " +
    "Use when you have specific URLs and need their full content.",

  inputSchema: z.object({
    urls: z
      .union([z.string(), z.array(z.string()).max(20)])
      .describe(
        "Single URL string or array of up to 20 URLs to extract content from."
      ),

    extract_depth: z
      .enum(["basic", "advanced"])
      .optional()
      .default("basic")
      .describe(
        "'basic' (1 credit/5 URLs) is fast. " +
        "'advanced' (2 credits/5 URLs) retrieves tables and embedded content with higher success."
      ),

    format: z
      .enum(["markdown", "text"])
      .optional()
      .default("markdown")
      .describe(
        "Output format. 'markdown' is default and faster; 'text' returns plain text."
      ),

    query: z
      .string()
      .optional()
      .describe(
        "When provided, extracted content chunks are re-ranked by relevance to this query."
      ),

    chunks_per_source: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe(
        "Max content chunks (≤500 chars each) returned per URL. " +
        "Only available when 'query' is also provided (1–5)."
      ),

    include_images: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include image URLs extracted from each page."),

    include_favicon: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include a favicon URL with each result."),

    timeout: z
      .number()
      .min(1)
      .max(60)
      .optional()
      .describe(
        "Per-URL timeout in seconds (1–60). " +
        "Defaults to 10s for basic and 30s for advanced extraction."
      ),

    include_usage: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include API credit usage in the response."),
  }),

  execute: async (params) => {
    try {
      const body: Record<string, unknown> = {
        urls: params.urls,
        extract_depth: params.extract_depth,
        format: params.format,
        include_images: params.include_images,
        include_favicon: params.include_favicon,
        include_usage: params.include_usage,
      };

      if (params.query)                    body.query              = params.query;
      if (params.chunks_per_source != null) body.chunks_per_source = params.chunks_per_source;
      if (params.timeout != null)          body.timeout            = params.timeout;

      const data = await tavilyPost<Record<string, unknown>>("/extract", body);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

// ─── tavilyCrawl ──────────────────────────────────────────────────────────────

export const tavilyCrawl = tool({
  description:
    "Crawl a website starting from a root URL, traversing it like a graph. " +
    "Explores hundreds of paths in parallel with built-in extraction. " +
    "Returns the raw content of each discovered page. " +
    "Use to ingest an entire documentation site, blog, or knowledge base. " +
    "Supports natural-language instructions to guide which pages to surface.",

  inputSchema: z.object({
    url: z
      .string()
      .describe("The root URL to start crawling from."),

    instructions: z
      .string()
      .optional()
      .describe(
        "Natural-language guidance for the crawler, e.g. 'Find all pages about the Python SDK'. " +
        "Increases cost to 2 credits/10 pages."
      ),

    max_depth: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .default(1)
      .describe("How many link-hops away from the root to explore (1–5)."),

    max_breadth: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .default(20)
      .describe("Max links to follow per page per depth level (1–500)."),

    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .default(50)
      .describe("Total pages to process before stopping."),

    select_paths: z
      .array(z.string())
      .optional()
      .describe(
        "Regex patterns to INCLUDE only URLs matching these path patterns, " +
        "e.g. ['/docs/.*', '/api/v1.*']."
      ),

    select_domains: z
      .array(z.string())
      .optional()
      .describe(
        "Regex patterns to restrict crawling to specific (sub)domains, " +
        "e.g. ['^docs\\.example\\.com$']."
      ),

    exclude_paths: z
      .array(z.string())
      .optional()
      .describe(
        "Regex patterns to EXCLUDE URLs matching these path patterns, " +
        "e.g. ['/private/.*', '/admin/.*']."
      ),

    exclude_domains: z
      .array(z.string())
      .optional()
      .describe(
        "Regex patterns to exclude specific (sub)domains from crawling, " +
        "e.g. ['^private\\.example\\.com$']."
      ),

    allow_external: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether to follow and return links to external domains."),

    extract_depth: z
      .enum(["basic", "advanced"])
      .optional()
      .default("basic")
      .describe(
        "'advanced' retrieves tables and embedded content with higher success (higher latency)."
      ),

    format: z
      .enum(["markdown", "text"])
      .optional()
      .default("markdown")
      .describe("Content format per page. 'text' may increase latency."),

    include_images: z
      .boolean()
      .optional()
      .default(false)
      .describe("Extract image URLs from each crawled page."),

    include_favicon: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include a favicon URL with each result."),

    chunks_per_source: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe(
        "Max content chunks (≤500 chars each) per page. " +
        "Only available when 'instructions' is provided (1–5). Default 3."
      ),

    timeout: z
      .number()
      .min(10)
      .max(150)
      .optional()
      .default(150)
      .describe("Max seconds to wait for the crawl to complete (10–150)."),

    include_usage: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include API credit usage in the response."),
  }),

  execute: async (params) => {
    try {
      const body: Record<string, unknown> = {
        url: params.url,
        max_depth: params.max_depth,
        max_breadth: params.max_breadth,
        limit: params.limit,
        allow_external: params.allow_external,
        extract_depth: params.extract_depth,
        format: params.format,
        include_images: params.include_images,
        include_favicon: params.include_favicon,
        timeout: params.timeout,
        include_usage: params.include_usage,
      };

      if (params.instructions)           body.instructions       = params.instructions;
      if (params.chunks_per_source != null) body.chunks_per_source = params.chunks_per_source;
      if (params.select_paths?.length)   body.select_paths       = params.select_paths;
      if (params.select_domains?.length) body.select_domains     = params.select_domains;
      if (params.exclude_paths?.length)  body.exclude_paths      = params.exclude_paths;
      if (params.exclude_domains?.length) body.exclude_domains   = params.exclude_domains;

      const data = await tavilyPost<Record<string, unknown>>("/crawl", body);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

// ─── tavilyMap ────────────────────────────────────────────────────────────────

export const tavilyMap = tool({
  description:
    "Generate a full sitemap of a website starting from a root URL. " +
    "Returns a list of discovered URLs without extracting page content. " +
    "Use this to understand site structure before targeted extraction or crawling, " +
    "or when you only need a URL inventory rather than full content.",

  inputSchema: z.object({
    url: z
      .string()
      .describe("The root URL to begin site mapping from."),

    instructions: z
      .string()
      .optional()
      .describe(
        "Natural-language guidance to surface specific pages, " +
        "e.g. 'Find all changelog pages'. Increases cost to 2 credits/10 pages."
      ),

    max_depth: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .default(1)
      .describe("How many link-hops away from the root to explore (1–5)."),

    max_breadth: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .default(20)
      .describe("Max links to follow per page per depth level (1–500)."),

    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .default(50)
      .describe("Total pages to process before stopping."),

    select_paths: z
      .array(z.string())
      .optional()
      .describe(
        "Regex patterns to INCLUDE only URLs with matching path patterns."
      ),

    select_domains: z
      .array(z.string())
      .optional()
      .describe(
        "Regex patterns to restrict mapping to specific (sub)domains."
      ),

    exclude_paths: z
      .array(z.string())
      .optional()
      .describe("Regex patterns to EXCLUDE paths from the map."),

    exclude_domains: z
      .array(z.string())
      .optional()
      .describe("Regex patterns to exclude specific (sub)domains from the map."),

    allow_external: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether to include external domain links in the results."),

    timeout: z
      .number()
      .min(10)
      .max(150)
      .optional()
      .default(150)
      .describe("Max seconds to wait for the map operation (10–150)."),

    include_usage: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include API credit usage in the response."),
  }),

  execute: async (params) => {
    try {
      const body: Record<string, unknown> = {
        url: params.url,
        max_depth: params.max_depth,
        max_breadth: params.max_breadth,
        limit: params.limit,
        allow_external: params.allow_external,
        timeout: params.timeout,
        include_usage: params.include_usage,
      };

      if (params.instructions)           body.instructions   = params.instructions;
      if (params.select_paths?.length)   body.select_paths   = params.select_paths;
      if (params.select_domains?.length) body.select_domains = params.select_domains;
      if (params.exclude_paths?.length)  body.exclude_paths  = params.exclude_paths;
      if (params.exclude_domains?.length) body.exclude_domains = params.exclude_domains;

      const data = await tavilyPost<Record<string, unknown>>("/map", body);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});