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

export const wikiQuery = () =>
  tool({
    description:
      "Query the Etles knowledge wiki. The wiki contains compiled expertise on " +
      "copywriting, ad creative, research methodology, content creation, and coding craft. " +
      "Always call with action='index' first to see what's available, then call with " +
      "action='read' and the specific page name. Use this before starting any task " +
      "that involves writing, ads, research, content, or code — the wiki contains " +
      "accumulated best practices that improve output quality.",
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
        if (!index) {
          return {
            success: false,
            error: "Wiki index not found. The wiki may not be initialized yet.",
          };
        }
        const pages = await listAllPages();
        return {
          success: true,
          index,
          availablePages: pages,
          message: `Wiki has ${pages.length} pages. Use action='read' with a page name to load content.`,
        };
      }

      // action === "read"
      if (!page) {
        return { success: false, error: "page is required when action='read'" };
      }

      const resolved = safePath(`${page}.md`);
      if (!resolved) {
        return { success: false, error: `Invalid page name: "${page}". Use simple names like 'copywriting'.` };
      }

      const content = await readMd(resolved);
      if (!content) {
        const pages = await listAllPages();
        return {
          success: false,
          error: `Page "${page}" not found.`,
          availablePages: pages,
        };
      }

      return {
        success: true,
        page,
        content,
        size: content.length,
      };
    },
  });

// ── wikiIngest ────────────────────────────────────────────────────────────────

export const wikiIngest = () =>
  tool({
    description:
      "Write or update a page in the Etles knowledge wiki. Use this to save " +
      "valuable knowledge the agent has learned or synthesized — a copywriting insight " +
      "that worked well, a research methodology that produced great results, " +
      "an ad angle that converted, a coding pattern that solved a hard problem. " +
      "The wiki grows over time. Write concise, dense, practitioner-grade content. " +
      "No fluff. Every sentence should earn its place. " +
      "After writing, update the index page to reflect the new/updated content.",
    inputSchema: z.object({
      page: z
        .string()
        .describe(
          "Page name without .md extension. Use existing pages to update them " +
          "or a new name to create a new page. Use kebab-case. " +
          "Examples: 'copywriting', 'ad-creative', 'hook-formulas', 'email-sequences'."
        ),
      content: z
        .string()
        .max(MAX_WRITE_CHARS)
        .describe(
          "Full markdown content for the page. Must start with a # heading. " +
          "Include: what works, what doesn't, specific examples, frameworks, rules. " +
          "Dense and specific — not generic advice. Append '\\n\\n---\\n*Last updated by Etles: [date]*' at the bottom."
        ),
      reason: z
        .string()
        .describe("Why this knowledge is being added or what triggered this update."),
      updateIndex: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to update index.md to reflect this change. Default true."),
    }),
    execute: async ({ page, content, reason, updateIndex }) => {
      await ensureWikiDir();

      const resolved = safePath(`${page}.md`);
      if (!resolved) {
        return { success: false, error: `Invalid page name: "${page}". Use kebab-case, no special chars.` };
      }

      // Add timestamp if not present
      const timestamp = new Date().toISOString().split("T")[0];
      const finalContent = content.includes("Last updated by Etles")
        ? content.replace(/\*Last updated by Etles:.*\*/, `*Last updated by Etles: ${timestamp}*`)
        : `${content}\n\n---\n*Last updated by Etles: ${timestamp}*`;

      try {
        await fs.writeFile(resolved, finalContent, "utf-8");
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      // Optionally refresh index
      if (updateIndex) {
        try {
          const pages = await listAllPages();
          const existingIndex = await readMd(INDEX_PATH);

          if (!existingIndex) {
            // Bootstrap a minimal index
            const bootstrapIndex = `# Etles Knowledge Wiki — Index

*This wiki compounds Etles's expertise over time. Agents read this index first, then load specific pages.*

## Pages

${pages.map((p) => `- **${p}** — see \`${p}.md\``).join("\n")}

---
*Index last updated: ${timestamp}*
`;
            await fs.writeFile(INDEX_PATH, bootstrapIndex, "utf-8");
          } else if (!existingIndex.includes(page)) {
            // Append new page to index
            const updated = existingIndex.replace(
              /---\n\*Index last updated:.*\*/,
              `- **${page}** — see \`${page}.md\`\n\n---\n*Index last updated: ${timestamp}*`
            );
            await fs.writeFile(INDEX_PATH, updated !== existingIndex ? updated : existingIndex + `\n- **${page}** — see \`${page}.md\``, "utf-8");
          } else {
            // Update timestamp in existing index
            const updated = existingIndex.replace(
              /\*Index last updated:.*\*/,
              `*Index last updated: ${timestamp}*`
            );
            await fs.writeFile(INDEX_PATH, updated, "utf-8");
          }
        } catch {
          // Non-fatal — page was written, index update failed
        }
      }

      return {
        success: true,
        page,
        reason,
        size: finalContent.length,
        message: `Wiki page '${page}' saved. ${updateIndex ? "Index updated." : ""}`,
      };
    },
  });