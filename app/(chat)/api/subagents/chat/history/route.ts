import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getSubagentChatMessages, clearSubagentChatMessages } from "@/lib/subagent-redis";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const agentSlug = request.nextUrl.searchParams.get("agentSlug");
  if (!agentSlug) {
    return new NextResponse("Missing agentSlug", { status: 400 });
  }

  const messages = await getSubagentChatMessages(session.user.id, agentSlug);
  return NextResponse.json({ messages });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const agentSlug = request.nextUrl.searchParams.get("agentSlug");
  if (!agentSlug) {
    return new NextResponse("Missing agentSlug", { status: 400 });
  }

  await clearSubagentChatMessages(session.user.id, agentSlug);
  return NextResponse.json({ success: true });
}
