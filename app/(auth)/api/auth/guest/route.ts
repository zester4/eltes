import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { signIn } from "@/app/(auth)/auth";
import { isDevelopmentEnvironment } from "@/lib/constants";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectUrl = searchParams.get("redirectUrl") || "/";

  // Disable guest login and redirect to main login page
  return NextResponse.redirect(
    new URL(`/login?redirectUrl=${encodeURIComponent(redirectUrl)}`, request.url)
  );
}
