/**
 * lib/ai/tools/wiki.ts
 *
 * Karpathy-style LLM wiki tools.
 * The wiki lives at ./.wiki/ in the project root.
 *
 * Two tools:
 *   wikiQuery  — read index.md first, then load specific page(s)
 *   wikiIngest — agent writes/updates a wiki page with new knowledge
 *
 * The wiki compounds over time. Every time an agent learns something
 * valuable (from research, a task, a client win), it ingests it.
 * Next time that topic comes up, it reads the compiled page — not raw sources.
 *
 * Vercel: add to next.config.ts:
 *   experimental: {
 *     outputFileTracingIncludes: {
 *       '/api/**': ['./.wiki/**\/*.md'],
 *     },
 *   }
 */

import { tool } from "ai";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  getUserSkillsByUserId,
  getUserSkillBySlug,
  saveUserSkill,
} from "@/lib/db/queries";

const WIKI_ROOT = path.join(process.cwd(), ".wiki");
const INDEX_PATH = path.join(WIKI_ROOT, "index.md");
const MAX_READ_CHARS = 28_000;
const MAX_WRITE_CHARS = 20_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureWikiDir(): Promise<void> {
  await fs.mkdir(WIKI_ROOT, { recursive: true });
}

function safePath(relativePath: string): string | null {
  const resolved = path.resolve(WIKI_ROOT, relativePath);
  if (!resolved.startsWith(WIKI_ROOT + path.sep) && resolved !== WIKI_ROOT) {
    return null; // directory traversal
  }
  if (!resolved.endsWith(".md")) {
    return null; // md only
  }
  return resolved;
}

async function readMd(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    if (content.length > MAX_READ_CHARS) {
      return `${content.slice(0, MAX_READ_CHARS)}\n\n[...truncated at ${MAX_READ_CHARS} chars]`;
    }
    return content;
  } catch {
    return null;
  }
}

async function listAllPages(): Promise<string[]> {
  try {
    const entries = await fs.readdir(WIKI_ROOT, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "index.md")
      .map((e) => e.name.replace(".md", ""));
  } catch {
    return [];
  }
}

// ── wikiQuery ─────────────────────────────────────────────────────────────────

export const wikiQuery = ({ userId }: { userId?: string } = {}) =>
  tool({
    description:
      "Query the Etles knowledge base and user-defined skills. The wiki contains " +
      "compiled expertise on various topics, as well as private skills uploaded by the user " +
      "or learned by agents. Always call with action='index' first to see ALL available " +
      "pages and skills, then call with action='read' and the specific page name. " +
      "Use this to retrieve custom instructions, frameworks, or domain-specific knowledge " +
      "associated with the user's account.",
    inputSchema: z.object({
      action: z
        .enum(["index", "read"])
        .describe("'index' loads the master table of contents. 'read' loads a specific page."),
      page: z
        .string()
        .optional()
        .describe(
          "Page name without .md extension. Required when action='read'. " +
          "Examples: 'copywriting', 'ad-creative', 'research', 'content-creation', 'coding-craft'. " +
          "Get the full list from action='index'."
        ),
    }),
    execute: async ({ action, page }) => {
      await ensureWikiDir();

      if (action === "index") {
        const index = await readMd(INDEX_PATH);
        const defaultPages = await listAllPages();
        let userSkillsData: any[] = [];

        if (userId) {
          try {
            userSkillsData = await getUserSkillsByUserId(userId);
          } catch (error) {
            console.error("Failed to load user skills for index:", error);
          }
        }

        const userSkillsSlugs = userSkillsData.map((s) => s.slug);
        const allPages = Array.from(new Set([...defaultPages, ...userSkillsSlugs]));

        // Construct a dynamic index that includes user skills
        let dynamicIndex = index ?? "# Etles Knowledge Wiki\n\n";
        if (userSkillsData.length > 0) {
          dynamicIndex += "\n\n## User-Specific Skills (Private)\n";
          for (const s of userSkillsData) {
            dynamicIndex += `- **${s.title}** (slug: \`${s.slug}\`) — ${s.description ?? "No description"}\n`;
          }
        }

        return {
          success: true,
          index: dynamicIndex,
          availablePages: allPages,
          userSkills: userSkillsSlugs,
          defaultPages: defaultPages,
          message: `Wiki has ${defaultPages.length} default pages and ${userSkillsData.length} user-specific skills. Use action='read' with a page name to load content.`,
        };
      }

      // action === "read"
      if (!page) {
        return { success: false, error: "page is required when action='read'" };
      }

      // 1. Check user skills in DB first
      if (userId) {
        try {
          const skill = await getUserSkillBySlug(userId, page);
          if (skill) {
            return {
              success: true,
              page,
              content: skill.content,
              isUserSkill: true,
              size: skill.content.length,
            };
          }
        } catch (error) {
          console.error(`Failed to load user skill "${page}":`, error);
        }
      }

      // 2. Check default pages in .wiki folder
      const resolved = safePath(`${page}.md`);
      if (resolved) {
        const content = await readMd(resolved);
        if (content) {
          return {
            success: true,
            page,
            content,
            isUserSkill: false,
            size: content.length,
          };
        }
      }

      const defaultPages = await listAllPages();
      return {
        success: false,
        error: `Page "${page}" not found.`,
        availablePages: defaultPages,
      };
    },
  });

// ── wikiIngest ────────────────────────────────────────────────────────────────

export const wikiIngest = ({ userId }: { userId?: string } = {}) =>
  tool({
    description:
      "Write or update a page in the user's knowledge base (Skills). Use this to save " +
      "valuable knowledge the agent has learned or synthesized for THIS specific user. " +
      "The user's knowledge base grows over time. Write concise, dense, practitioner-grade content. " +
      "No fluff. Every sentence should earn its place.",
    inputSchema: z.object({
      page: z
        .string()
        .describe(
          "Page name without .md extension. Use kebab-case. " +
          "Examples: 'project-preferences', 'style-guide', 'technical-stack'."
        ),
      title: z
        .string()
        .optional()
        .describe("Human-readable title for the skill. Default is capitalized page name."),
      content: z
        .string()
        .max(MAX_WRITE_CHARS)
        .describe(
          "Full markdown content for the page. Must start with a # heading. " +
          "Include: what works, what doesn't, specific examples, frameworks, rules."
        ),
      description: z
        .string()
        .optional()
        .describe("One-sentence summary of what this skill covers."),
      reason: z
        .string()
        .describe("Why this knowledge is being added or what triggered this update."),
    }),
    execute: async ({ page, title, content, description, reason }) => {
      if (!userId) {
        return {
          success: false,
          error: "Unauthorized: No userId provided for wiki ingestion.",
        };
      }

      // Add timestamp if not present
      const timestamp = new Date().toISOString().split("T")[0];
      const finalContent = content.includes("Last updated by Etles")
        ? content.replace(/\*Last updated by Etles:.*\*/, `*Last updated by Etles: ${timestamp}*`)
        : `${content}\n\n---\n*Last updated by Etles: ${timestamp}*`;

      const humanTitle = title ?? page.split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");

      try {
        await saveUserSkill({
          userId,
          title: humanTitle,
          slug: page,
          content: finalContent,
          description: description ?? reason,
        });

        return {
          success: true,
          page,
          title: humanTitle,
          reason,
          size: finalContent.length,
          message: `Skill '${humanTitle}' saved to user knowledge base.`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
