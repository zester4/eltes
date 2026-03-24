//app/(chat)/api/triggers/route.ts
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { auth } from "../../../(auth)/auth";
import { SUPPORTED_TRIGGERS } from "@/lib/ai/triggers";
import { guestRegex } from "@/lib/constants";

const composio = new Composio({ provider: new VercelProvider() });

// GET: List available trigger types and active user triggers
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isGuest = guestRegex.test(session?.user?.email ?? "");
  if (isGuest) {
    return Response.json({ error: "Unauthorized: Guest access not allowed" }, { status: 401 });
  }

  try {
    let activeTriggersItems: any[] = [];
    try {
      const userAccounts = await composio.connectedAccounts.list({
        userIds: [session.user.id],
      });
      const accountIds = userAccounts.items.map((a: any) => a.id);
      
      if (accountIds.length > 0) {
        // Use listActive as a fallback if getActiveTriggers fails
        const triggerManager = composio.triggers as any;
        const listMethod = triggerManager.getActiveTriggers || triggerManager.listActive || triggerManager.list;
        
        if (listMethod) {
          const activeTriggers = await listMethod.call(triggerManager, {
            connectedAccountIds: accountIds,
          });
          activeTriggersItems = activeTriggers.items || [];
        }
      }
    } catch (innerError) {
      console.error("Error fetching active triggers, continuing with empty list:", innerError);
    }

    return Response.json({
      available: SUPPORTED_TRIGGERS,
      active: activeTriggersItems,
    });
  } catch (error: any) {
    console.error("Failed to fetch triggers:", error);
    return Response.json({ error: "Failed to fetch triggers", details: error.message }, { status: 500 });
  }
}

// POST: Create a new trigger instance
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isGuest = guestRegex.test(session?.user?.email ?? "");
  if (isGuest) {
    return Response.json({ error: "Unauthorized: Guest access not allowed" }, { status: 401 });
  }

  try {
    const { triggerSlug, config } = await req.json();
    
    // Fetch connected accounts for this user
    const userAccounts = await composio.connectedAccounts.list({
      userIds: [session.user.id],
    });

    // Find the account matching the toolkit of the trigger (heuristic)
    const toolkitHint = triggerSlug.split('_')[0].toLowerCase();
    const targetAccount = userAccounts.items.find((acc: any) => {
      const appName = String(acc.appName || acc.appId || "").toLowerCase();
      const toolkit = String(acc.toolkit?.slug || acc.toolkit || "").toLowerCase();
      return appName.includes(toolkitHint) || toolkit.includes(toolkitHint);
    });

    if (!targetAccount) {
      return Response.json({ error: `No connected account found for ${toolkitHint}` }, { status: 400 });
    }

    // Dynamic config discovery - no hardcoded defaults
    const finalConfig = config || {};

    const triggerManager = composio.triggers as any;
    const createMethod = triggerManager.create || triggerManager.subscribe || triggerManager.upsert;

    const trigger = await createMethod.call(triggerManager,
      session.user.id,
      triggerSlug,
      { 
        triggerConfig: finalConfig,
        connected_account_id: targetAccount.id 
      }
    );

    return Response.json({ success: true, trigger });
  } catch (error: any) {
    console.error("Failed to create trigger:", error);
    return Response.json({ error: "Failed to create trigger", details: error.message }, { status: 500 });
  }
}
