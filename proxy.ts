import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { guestRegex, isDevelopmentEnvironment } from "./lib/constants";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  console.log(`[Proxy] Request: ${request.method} ${pathname}`);
  
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  const lowerPath = pathname.toLowerCase();
  if (
    lowerPath === "/" ||
    lowerPath.startsWith("/login") ||
    lowerPath.startsWith("/register") ||
    lowerPath.startsWith("/api/auth") ||
    lowerPath.startsWith("/api/composio/webhook") ||
    lowerPath.startsWith("/api/webhooks") ||
    lowerPath.startsWith("/api/agent/workflow") ||
    lowerPath.startsWith("/api/agent/notify") ||
    lowerPath.startsWith("/api/agent/delegate") ||
    lowerPath.startsWith("/api/agent/handoff") ||
    lowerPath.startsWith("/api/telegram") ||
    lowerPath.startsWith("/api/scheduled") ||
    /\.(png|jpg|jpeg|gif|svg|webp|ico|m3u8|ts)$/.test(lowerPath)
  ) {
    console.log(`[Proxy] Allowing public path: ${pathname}`);
    return NextResponse.next();
  }

  const protocol = request.headers.get("x-forwarded-proto") || "http";
  const isSecure = protocol === "https";

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: isSecure,
  });

  if (!token) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
    
    const currentUrl = new URL(pathname, baseUrl);
    if (request.nextUrl.search) currentUrl.search = request.nextUrl.search;
    
    const redirectUrl = encodeURIComponent(currentUrl.toString());

    return NextResponse.redirect(
      new URL(`/api/auth/guest?redirectUrl=${redirectUrl}`, request.url)
    );
  }

  const isGuest = guestRegex.test(token?.email ?? "");

  if (token && !isGuest && ["/login", "/register"].includes(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/api/:path*",
    "/login",
    "/register",
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};