import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Please use the user-specific dynamic webhook route: /api/webhooks/[platform]/[userId]" }, { status: 400 });
}
