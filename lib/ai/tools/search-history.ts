import { tool } from "ai";
import { z } from "zod";
import { searchUserMessages } from "@/lib/db/queries";
import { subDays, startOfDay, endOfDay } from "date-fns";

export const searchPastConversations = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Search through the user's past conversation history across all chats. " +
      "Use this to answer questions about previous discussions, find technical details, " +
      "or recall context from 'yesterday', 'last week', or even months ago. " +
      "The tool searches message text, tool names, and tool outputs. " +
      "It returns the matching message along with up to 1 message before and after for context.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("The search term or phrase to look for in past messages."),
      timeframe: z
        .enum(["yesterday", "last_week", "last_month", "all_time"])
        .optional()
        .default("all_time")
        .describe("Limit the search to a specific relative time period."),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe("Number of relevant matches to return (default: 5)."),
    }),
    execute: async ({ query, timeframe, limit }) => {
      try {
        let startDate: Date | undefined;
        let endDate: Date | undefined;

        const now = new Date();

        if (timeframe === "yesterday") {
          const yesterday = subDays(now, 1);
          startDate = startOfDay(yesterday);
          endDate = endOfDay(yesterday);
        } else if (timeframe === "last_week") {
          startDate = subDays(now, 7);
        } else if (timeframe === "last_month") {
          startDate = subDays(now, 30);
        }

        const results = await searchUserMessages({
          userId,
          query,
          limit,
          startDate,
          endDate,
        });

        if (results.length === 0) {
          return {
            success: true,
            results: [],
            message: "No matching past messages found.",
          };
        }

        const formattedResults = results.map((res) => {
          const m = res.message;
          const ctx = res.context;

          const formatParts = (parts: any[]) =>
            parts
              .map((p) => {
                if (p.type === "text") return p.text;
                if (p.type === "tool-invocation")
                  return `[Called Tool: ${p.toolName}]`;
                if (p.type === "tool-result")
                  return `[Tool Result (${p.toolName}): ${JSON.stringify(p.result)}]`;
                return "";
              })
              .join("\n");

          return {
            chatTitle: res.chatTitle,
            chatId: m.chatId,
            timestamp: m.createdAt,
            match: {
              role: m.role,
              content: formatParts(m.parts as any[]),
            },
            context: {
              previous: ctx.previous
                ? {
                    role: ctx.previous.role,
                    content: formatParts(ctx.previous.parts as any[]),
                  }
                : null,
              next: ctx.next
                ? {
                    role: ctx.next.role,
                    content: formatParts(ctx.next.parts as any[]),
                  }
                : null,
            },
          };
        });

        return {
          success: true,
          results: formattedResults,
        };
      } catch (error: any) {
        console.error("Tool execution failed:", error);
        return {
          success: false,
          error: error.message || "An error occurred during search.",
        };
      }
    },
  });
