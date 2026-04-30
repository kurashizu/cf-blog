import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Edge-compatible JWT verification using Web Crypto API
// Cloudflare Access JWTs use RS256 signatures

interface JWTPayload {
  email?: string;
  name?: string;
  sub?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  iat?: number;
}

async function fetchJWKS(issuer: string): Promise<JsonWebKey> {
  const jwksUrl = `${issuer}/cdn-cgi/access/certs`;
  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }
  const data = await response.json() as { keys: JsonWebKey[] };
  // Return the first key (RS256 key for Cloudflare Access)
  return data.keys[0];
}

async function verifyJWT(token: string, issuer: string, audience: string): Promise<JWTPayload> {
  // Decode the JWT header and payload (without verification)
  const [headerB64, payloadB64, signatureB64] = token.split(".");

  // Decode header
  const payload: JWTPayload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));

  // Check expiration
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    throw new Error("Token expired");
  }

  // Fetch the public key
  const jwk = await fetchJWKS(issuer);
  jwk.alg = "RS256";

  // Import the public key
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // Verify the signature
  const signatureArray = Uint8Array.from(atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

  const isValid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    publicKey,
    signatureArray,
    data
  );

  if (!isValid) {
    throw new Error("Invalid signature");
  }

  // Verify issuer and audience
  if (payload.iss !== issuer) {
    throw new Error("Invalid issuer");
  }

  // Audience can be a string or array
  const audValue = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audValue.includes(audience)) {
    throw new Error("Invalid audience");
  }

  return payload;
}

export async function middleware(request: NextRequest) {
  // Only protect /admin/* routes
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
      if (process.env.NODE_ENV === "development") {
        return NextResponse.next();
      }
      return new NextResponse("Unauthorized", { status: 403 });
    }

    const payload = await verifyJWT(token, TEAM_DOMAIN, POLICY_AUD);

    // Add user info to request headers for downstream use
    const requestHeaders = new Headers(request.headers);
    if (payload.email) {
      requestHeaders.set("x-user-email", payload.email);
    }
    if (payload.name) {
      requestHeaders.set("x-user-name", payload.name);
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
