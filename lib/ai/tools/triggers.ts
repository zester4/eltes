import { tool } from "ai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { z } from "zod";

const composio = new Composio({ provider: new VercelProvider() });

export const setupTrigger = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Set up a real-time event trigger (e.g., watch for new GitHub commits, Slack messages, or Gmail emails). " +
      "First, find the trigger you want to setup from the list of supported triggers. " +
      "Then provide the required configuration (e.g. owner and repo for GitHub).",
    inputSchema: z.object({
      triggerSlug: z.string().describe("The slug of the trigger to setup, e.g. 'GITHUB_COMMIT_EVENT'"),
      config: z.record(z.any()).describe("The configuration for the trigger, e.g. { owner: 'composio', repo: 'sdk' }"),
    }),
    execute: async ({ triggerSlug, config }) => {
      try {
        // Fetch connected accounts for this user
        const userAccounts = await composio.connectedAccounts.list({
          userIds: [userId],
        });

        // Find the account matching the toolkit of the trigger
        const toolkitHint = triggerSlug.split('_')[0].toLowerCase();
        const targetAccount = userAccounts.items.find((acc: any) => 
          (acc.appName || acc.appId || "").toLowerCase().includes(toolkitHint)
        );

        // Dynamic config discovery - no hardcoded defaults
        const triggerType = await composio.triggers.getType(triggerSlug);
        const finalConfig = config || {};

        const trigger = await composio.triggers.create(userId, triggerSlug, {
          triggerConfig: finalConfig,
          connectedAccountId: targetAccount?.id,
        });
        return {
          success: true,
          message: `Successfully set up trigger ${triggerSlug}.`,
          triggerId: trigger.triggerId,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  });

export const listActiveTriggers = ({ userId }: { userId: string }) =>
  tool({
    description: "List all active event triggers currently monitoring your accounts.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const userAccounts = await composio.connectedAccounts.list({
          userIds: [userId],
        });
        const accountIds = userAccounts.items.map((a: any) => a.id);

        const active = await (composio.triggers as any).listActive({
          connectedAccountIds: accountIds,
        });
        return {
          success: true,
          triggers: active.items.map((t: any) => ({
            id: t.triggerId,
            slug: t.triggerSlug,
            status: t.status,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  });

export const removeTrigger = () =>
  tool({
    description: "Remove an active event trigger by its ID.",
    inputSchema: z.object({
      triggerId: z.string().describe("The ID of the trigger to remove."),
    }),
    execute: async ({ triggerId }) => {
      try {
        await (composio.triggers as any).delete(triggerId);
        return { success: true, message: `Trigger ${triggerId} removed.` };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  });
