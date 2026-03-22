import { auth } from "../../../(auth)/auth";
import { getEventsByUserId } from "@/lib/db/queries";
import { guestRegex } from "@/lib/constants";

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
    const events = await getEventsByUserId({
      userId: session.user.id,
      limit: 50,
    });

    return Response.json({ events });
  } catch (error: any) {
    console.error("Failed to fetch events from DB:", error);
    return Response.json({ error: "Failed to load events", details: error.message }, { status: 500 });
  }
}
