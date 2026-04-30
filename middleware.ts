import { jwtVerify, createRemoteJWKSet } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Only protect /admin/* routes (exclude the new post page which also needs auth)
  if (!request.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  try {
    const TEAM_DOMAIN = process.env.TEAM_DOMAIN;
    const POLICY_AUD = process.env.POLICY_AUD;

    // Skip validation if env vars not configured (for local dev without Access)
    if (!TEAM_DOMAIN || !POLICY_AUD) {
      // In production, you would want to enforce this
      // For now, allow through for development
      if (process.env.NODE_ENV === "development") {
        return NextResponse.next();
      }
      return new NextResponse("Unauthorized", { status: 403 });
    }

    const JWKS = createRemoteJWKSet(
      new URL(`${TEAM_DOMAIN}/cdn-cgi/access/certs`)
    );
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: TEAM_DOMAIN,
      audience: POLICY_AUD,
    });

    if (!payload) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Add user info to request headers for downstream use
    const requestHeaders = new Headers(request.headers);
    if (payload.email) {
      requestHeaders.set("x-user-email", payload.email as string);
    }
    if (payload.name) {
      requestHeaders.set("x-user-name", payload.name as string);
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    console.error("JWT verification failed:", error);
    return new NextResponse("Unauthorized", { status: 403 });
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
