import { Composio } from "@composio/core";
import { auth } from "../../../(auth)/auth";
import { guestRegex } from "@/lib/constants";

const composio = new Composio();

// GET: List all toolkits and their connection status
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
    // Fetch all 1000+ available apps directly to bypass pagination limits
    const appsRes = await fetch("https://backend.composio.dev/api/v1/apps", {
      headers: { "x-api-key": process.env.COMPOSIO_API_KEY! }
    });
    if (!appsRes.ok) throw new Error("Failed to fetch apps catalogue");
    
    const appsData = await appsRes.json();
    let allApps = appsData.items || [];
    
    // Deduplicate apps by key
    allApps = Array.from(new Map(allApps.map((a: any) => [a.key, a])).values());

    // Fetch user's connected accounts — no status filter to avoid SDK version issues
    let connectedApps = new Map<string, string>();
    try {
      const userAccounts = await composio.connectedAccounts.list({
        userIds: [session.user.id],
      });
      const items = userAccounts?.items ?? [];
      // Only keep ACTIVE connections; use lowercase for case-insensitive matching
      connectedApps = new Map(
        items
          .filter((acc: any) => !acc.status || acc.status === "ACTIVE")
          .map((acc: any) => [
            (acc.appName || acc.appId || "").toLowerCase(),
            acc.id,
          ])
      );
    } catch (accountError) {
      console.error("Failed to fetch connected accounts:", accountError);
      // Non-fatal: continue with empty connected map; toolkits still load
    }

    // Format a raw Composio app name/key to a human-readable Title Case label
    const formatAppName = (nameOrKey: string): string => {
      return nameOrKey
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    };

    return Response.json({
      toolkits: allApps
        .filter((t: any) => !t.no_auth) // Only show apps requiring auth
        .map((t: any) => ({
          slug: t.key,
          name: formatAppName(t.name || t.key),
          logo: t.logo,
          isConnected: connectedApps.has(t.key.toLowerCase()),
          connectedAccountId: connectedApps.get(t.key.toLowerCase()),
        })),
    });
  } catch (error: any) {
    console.error("Failed to fetch toolkits from Composio:", error);
    return Response.json({ 
      error: "Failed to load toolkits", 
      details: error.message,
      toolkits: [] 
    }, { status: error.status === 401 ? 401 : 500 });
  }
}

// POST: Start an OAuth flow for a specific toolkit
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isGuest = guestRegex.test(session?.user?.email ?? "");
  if (isGuest) {
    return Response.json({ error: "Unauthorized: Guest access not allowed" }, { status: 401 });
  }

  const { toolkit }: { toolkit: string } = await req.json();
  const origin = new URL(req.url).origin;
  
  try {
    const composioSession = await composio.create(session.user.id);
    
    const connectionRequest = await composioSession.authorize(toolkit, {
      callbackUrl: `${origin}/settings/connections`,
    });

    return Response.json({ redirectUrl: connectionRequest.redirectUrl });
  } catch (error: any) {
    console.error("Failed to initiate Composio authorization:", error);
    return Response.json({ error: "Failed to initiate connection", details: error.message }, { status: 500 });
  }
}
