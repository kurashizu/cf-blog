import { UAParser } from "ua-parser-js";

export interface VisitorInfo {
    ip: string;
    country: string;
    countryCode: string;
    region: string;
    city: string;
    timezone: string;
    isp: string;
    browser: string;
    os: string;
    deviceType: string;
    deviceName: string;
    logo: string;
}

const FIELDS = "status,country,countryCode,regionName,city,timezone,isp,query";
const API_BASE = "http://ip-api.com/json";

/**
 * Determine the fastfetch small logo filename based on the detected OS.
 */
function getLogoFilename(os: string): string {
    const osLower = os.toLowerCase();

    if (
        osLower.includes("mac os") ||
        osLower.includes("macos") ||
        osLower.includes("darwin") ||
        osLower.includes("ios") ||
        osLower.includes("iphone") ||
        osLower.includes("ipad")
    ) {
        return "macos_small.txt";
    }
    if (osLower.includes("windows")) {
        return "windows_11_small.txt";
    }
    if (osLower.includes("android")) {
        return "android_small.txt";
    }
    if (osLower.includes("linux")) {
        return "linux_small.txt";
    }
    if (osLower.includes("freebsd")) {
        return "freebsd_small.txt";
    }
    if (osLower.includes("openbsd")) {
        return "openbsd_small.txt";
    }
    if (osLower.includes("netbsd")) {
        return "netbsd_small.txt";
    }
    return "unknown_small.txt"; // fallback logo
}

/**
 * Parse User-Agent string to extract device info using ua-parser-js.
 */
function parseUA(ua: string): {
    browser: string;
    os: string;
    deviceType: string;
    deviceName: string;
} {
    const parser = new UAParser(ua);
    const b = parser.getBrowser();
    const o = parser.getOS();
    const d = parser.getDevice();

    const browser = [b.name, b.version].filter(Boolean).join(" ");
    const os = [o.name, o.version].filter(Boolean).join(" ");
    const deviceType = d.type ?? "";
    const deviceName = [d.vendor, d.model].filter(Boolean).join(" ") || "";

    return { browser, os, deviceType, deviceName };
}

/**
 * Look up geolocation for the given IP via ip-api.com's free JSON endpoint,
 * and parse the User-Agent string for device info.
 *
 * - HTTP only (HTTPS is a paid tier); Cloudflare Workers can call it directly.
 * - 45 req/min per source IP — for a personal blog this is plenty.
 * - Private/reserved/invalid IPs return empty geo fields rather than null.
 */
export async function getVisitorInfo(
    ip: string,
    ua?: string,
): Promise<VisitorInfo> {
    let country = "";
    let countryCode = "";
    let region = "";
    let city = "";
    let timezone = "";
    let isp = "";

    if (ip) {
        try {
            const url = `${API_BASE}/${encodeURIComponent(ip)}?fields=${FIELDS}`;
            const res = await fetch(url, {
                signal: AbortSignal.timeout(3000),
            });
            if (res.ok) {
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
                if (data.status === "success") {
                    ip = data.query ?? ip;
                    country = data.country ?? "";
                    countryCode = data.countryCode ?? "";
                    region = data.regionName ?? "";
                    city = data.city ?? "";
                    timezone = data.timezone ?? "";
                    isp = data.isp ?? "";
                }
            }
        } catch {
            // geo lookup failed — continue with empty fields
        }
    }

    const device = ua
        ? parseUA(ua)
        : { browser: "", os: "", deviceType: "", deviceName: "" };

    return {
        ip,
        country,
        countryCode,
        region,
        city,
        timezone,
        isp,
        ...device,
        logo: "", // filled in by the route handler
    };
}

/**
 * Map a User-Agent string to a fastfetch small logo filename.
 */
export { getLogoFilename };
