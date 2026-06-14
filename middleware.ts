import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
    if (request.nextUrl.pathname === "/") {
        const response = NextResponse.next();
        response.headers.set(
            "Cache-Control",
            "public, s-maxage=60, stale-while-revalidate=300",
        );
        // Force Cloudflare edge caching for Workers responses
        // (normally Workers HTML isn't cached at the edge)
        response.headers.set("CDN-Cache-Control", "public, s-maxage=60");
        response.headers.set(
            "Cloudflare-CDN-Cache-Control",
            "public, s-maxage=60",
        );
        // Remove Vary headers that prevent caching
        response.headers.delete("Vary");
        return response;
    }
    return NextResponse.next();
}

export const config = {
    matcher: "/",
};
