import { tool } from "ai";
import { Index } from "@upstash/vector";
import { z } from "zod";
import { unstable_noStore as noStore } from "next/cache";

// Per-user memory stored in namespaced Upstash Vector index.
// Each user gets their own namespace: `memory-{userId}`
// The index must have an embedded model enabled in the Upstash console
// (e.g., "text-embedding-3-small") so we can use `data` strings directly
// without generating embeddings manually.

export function getMemoryIndex() {
  return new Index({
    url: process.env.UPSTASH_VECTOR_REST_URL!,
    token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
  });
}

/**
 * Checks if the user has completed the conversational onboarding.
 * Queries the Upstash Vector memory for the 'onboarding_complete' key.
 */
export async function isUserOnboarded(userId: string): Promise<boolean> {
  noStore();
  try {
    const index = getMemoryIndex();
    const ns = index.namespace(`memory-${userId}`);
    const [result] = await ns.fetch(["onboarding_complete"]);
    return !!result;
  } catch (error) {
    console.error("Failed to check onboarding status:", error);
    return false;
  }
}

// ─── saveMemory ───────────────────────────────────────────────────────────────

export const saveMemory = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Save a piece of information to Etles's long-term memory about the user. " +
      "Use this when the user shares preferences, facts about themselves, goals, " +
      "recurring contexts, or anything worth remembering across sessions. " +
      "Always save with a clear, concise key so it can be recalled later.",
    inputSchema: z.object({
      key: z
        .string()
        .describe(
          "A short unique identifier for this memory, e.g. 'preferred_language', 'work_schedule', 'birthday'"
        ),
      content: z
        .string()
        .describe("The information to remember, written as a clear sentence."),
      tags: z
        .array(z.string())
        .optional()
        .describe(
          "Optional tags to categorize this memory, e.g. ['preference', 'work']"
        ),
    }),
    execute: async ({ key, content, tags }) => {
      try {
        const index = getMemoryIndex();
        const ns = index.namespace(`memory-${userId}`);

        await ns.upsert({
          id: key,
          data: content, // index auto-embeds using the configured model
          metadata: {
            key,
            content,
            tags: tags ?? [],
            savedAt: new Date().toISOString(),
          },
        });

        // After setup steps, if key is "onboarding_complete", trigger the completion hook
        if (key === "onboarding_complete") {
          const baseUrl = process.env.BASE_URL || (typeof window !== 'undefined' ? window.location.origin : "");
          if (baseUrl) {
            void fetch(`${baseUrl}/api/onboarding/complete`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-agent-secret": process.env.AGENT_DELEGATE_SECRET ?? "dev-internal",
              },
              body: JSON.stringify({ userId }),
            }).catch(() => {});
          }
        }

        return {
          success: true,
          message: `Memory saved: "${key}" → "${content}"`,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  });

// ─── recallMemory ─────────────────────────────────────────────────────────────

export const recallMemory = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Search long-term memory for relevant information about the user. " +
      "Use this at the start of conversations when context could help, or when " +
      "the user references something they may have told you before. " +
      "Returns the most semantically relevant memories.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "What you want to recall, e.g. 'user work schedule', 'preferred tools', 'upcoming goals'"
        ),
      topK: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of memories to return (default: 5)"),
    }),
    execute: async ({ query, topK }) => {
      try {
        const index = getMemoryIndex();
        const ns = index.namespace(`memory-${userId}`);

        const results = await ns.query({
          data: query,
          topK: topK ?? 5,
          includeMetadata: true,
        });

        if (!results.length) {
          return { memories: [], message: "No relevant memories found." };
        }

        const memories = results.map((r) => ({
          key: (r.metadata as any)?.key,
          content: (r.metadata as any)?.content,
          tags: (r.metadata as any)?.tags ?? [],
          savedAt: (r.metadata as any)?.savedAt,
          relevanceScore: r.score,
        }));

        return { memories };
      } catch (error: any) {
        return { memories: [], error: error.message };
      }
    },
  });

// ─── updateMemory ─────────────────────────────────────────────────────────────

export const updateMemory = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Update an existing memory entry. Use this when the user corrects or provides " +
      "new information that supersedes something previously remembered. " +
      "The key must match an existing saved memory.",
    inputSchema: z.object({
      key: z
        .string()
        .describe("The exact key of the memory to update."),
      newContent: z
        .string()
        .describe("The updated information to store."),
      tags: z
        .array(z.string())
        .optional()
        .describe("Updated tags (optional)."),
    }),
    execute: async ({ key, newContent, tags }) => {
      try {
        const index = getMemoryIndex();
        const ns = index.namespace(`memory-${userId}`);

        // Upsert overwrites the existing record with the same id (key)
        await ns.upsert({
          id: key,
          data: newContent,
          metadata: {
            key,
            content: newContent,
            tags: tags ?? [],
            updatedAt: new Date().toISOString(),
          },
        });

        return {
          success: true,
          message: `Memory updated: "${key}" → "${newContent}"`,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  });

// ─── deleteMemory ─────────────────────────────────────────────────────────────

export const deleteMemory = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Delete a specific memory by its key. Use this when the user explicitly asks " +
      "you to forget something, or when a memory is clearly outdated and no longer relevant.",
    inputSchema: z.object({
      key: z
        .string()
        .describe("The exact key of the memory to delete."),
    }),
    execute: async ({ key }) => {
      try {
        const index = getMemoryIndex();
        const ns = index.namespace(`memory-${userId}`);

        await ns.delete(key);

        return {
          success: true,
          message: `Memory deleted: "${key}"`,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  });
