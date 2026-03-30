import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { Redis } from "@upstash/redis";
import { 
  triggerHeartbeatWorkflow, 
  pauseUserCrons, 
  resumeUserCrons 
} from "@/lib/workflow/client";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { action } = await req.json() as { action: "sync" | "pause" | "resume" };

  try {
    switch (action) {
      case "sync":
        await triggerHeartbeatWorkflow({ userId });
        break;

      case "pause":
        await pauseUserCrons(userId);
        await redis.set(`agent:status:${userId}:paused`, true);
        break;

      case "resume":
        await resumeUserCrons(userId);
        await redis.set(`agent:status:${userId}:paused`, false);
        break;

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, action });
  } catch (error: any) {
    console.error(`[Agent Action] ${action} failed:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
