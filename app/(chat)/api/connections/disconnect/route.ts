import { Composio } from "@composio/core";
import { auth } from "../../../../(auth)/auth";
import { guestRegex } from "@/lib/constants";

const composio = new Composio();

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isGuest = guestRegex.test(session?.user?.email ?? "");
  if (isGuest) {
    return Response.json({ error: "Unauthorized: Guest access not allowed" }, { status: 401 });
  }

  const { connectedAccountId }: { connectedAccountId: string } = await req.json();
  
  try {
    await composio.connectedAccounts.delete(connectedAccountId);
    return Response.json({ success: true });
  } catch (error: any) {
    console.error("Failed to disconnect Composio account:", error);
    return Response.json({ error: "Failed to disconnect", details: error.message }, { status: 500 });
  }
}
