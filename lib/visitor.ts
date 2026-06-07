export interface VisitorInfo {
    ip: string;
    country: string;
    countryCode: string;
    region: string;
    city: string;
    timezone: string;
    isp: string;
}

const FIELDS = "status,country,countryCode,regionName,city,timezone,isp,query";
const API_BASE = "http://ip-api.com/json";

/**
 * Look up geolocation for the given IP via ip-api.com's free JSON endpoint.
 *
 * - HTTP only (HTTPS is a paid tier); Cloudflare Workers can call it directly.
 * - 45 req/min per source IP — for a personal blog this is plenty.
 * - Private/reserved/invalid IPs return `{ status: "fail", ... }` and we
 *   map that to `null` so the caller can fall back gracefully.
 */
export async function getVisitorInfo(ip: string): Promise<VisitorInfo | null> {
    if (!ip) return null;

    try {
        const url = `${API_BASE}/${encodeURIComponent(ip)}?fields=${FIELDS}`;
        const res = await fetch(url, {
            signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
            status?: string;
            country?: string;
            countryCode?: string;
            regionName?: string;
            city?: string;
            timezone?: string;
            isp?: string;
            query?: string;
        };
        if (data.status !== "success") return null;
        return {
            ip: data.query ?? ip,
            country: data.country ?? "",
            countryCode: data.countryCode ?? "",
            region: data.regionName ?? "",
            city: data.city ?? "",
            timezone: data.timezone ?? "",
            isp: data.isp ?? "",
        };
    } catch {
        return null;
    }
}
