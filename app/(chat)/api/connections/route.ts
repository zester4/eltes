//app/(chat)/api/connextions/route.ts
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
    // Fetch all toolkits from Composio SDK directly
    let allApps: any = await composio.toolkits.get();
    if (!Array.isArray(allApps)) {
      allApps = allApps?.items || [];
    }

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
            (acc.toolkit?.slug || acc.appName || acc.appId || "").toLowerCase(),
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
        .map((t: any) => {
          const slug = t.slug || t.key || "";
          const requiresAuth = !t.noAuth && !t.no_auth;
          return {
            slug,
            name: formatAppName(t.name || slug),
            logo: t.meta?.logo || t.logo,
            requiresAuth,
            // No-auth tools are always available — treat as connected by default
            isConnected: !requiresAuth || connectedApps.has(slug.toLowerCase()),
            connectedAccountId: connectedApps.get(slug.toLowerCase()),
          };
        }),
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
  try {
    const baseUrl =
      process.env.BASE_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : undefined) ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : new URL(req.url).origin);

    const composioSession = await composio.create(session.user.id);
    
    const connectionRequest = await composioSession.authorize(toolkit, {
      callbackUrl: `${baseUrl}/settings/connections`,
    });

    return Response.json({ redirectUrl: connectionRequest.redirectUrl });
  } catch (error: any) {
    console.error("Failed to initiate Composio authorization:", error);
    return Response.json({ error: "Failed to initiate connection", details: error.message }, { status: 500 });
  }
}