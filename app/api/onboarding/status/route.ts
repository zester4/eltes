import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { isUserOnboarded } from "@/lib/ai/tools/memory";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const onboarded = await isUserOnboarded(session.user.id);

  return NextResponse.json({ onboarded });
}
