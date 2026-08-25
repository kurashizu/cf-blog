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
    logoFile: string;
}

/**
 * Geo fields sourced from Cloudflare's `request.cf` properties. Cloudflare
 * resolves these at the edge for every request, so no visitor data ever
 * leaves our infrastructure (previously this module sent visitor IPs to
 * ip-api.com over plain HTTP).
 */
export interface VisitorGeo {
    /** ISO 3166-1 alpha-2, e.g. "DE" */
    country?: string;
    city?: string;
    region?: string;
    timezone?: string;
    /** Autonomous-system organisation, e.g. "Deutsche Telekom AG" */
    asOrganization?: string;
}

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

/** "DE" → "Germany"; falls back to the code itself. */
function countryName(code: string): string {
    if (!code) return "";
    try {
        return (
            new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code
        );
    } catch {
        return code;
    }
}

/**
 * Build visitor info from Cloudflare's edge-resolved geo data (`request.cf`)
 * and the User-Agent string. `geo` is undefined in local dev (`next dev`
 * without the CF proxy) — all geo fields then stay empty, same as the old
 * lookup-failure path.
 */
export function getVisitorInfo(
    ip: string,
    ua?: string,
    geo?: VisitorGeo,
): VisitorInfo {
    const device = ua
        ? parseUA(ua)
        : { browser: "", os: "", deviceType: "", deviceName: "" };

    const countryCode = geo?.country ?? "";

    return {
        ip,
        country: countryName(countryCode),
        countryCode,
        region: geo?.region ?? "",
        city: geo?.city ?? "",
        timezone: geo?.timezone ?? "",
        isp: geo?.asOrganization ?? "",
        ...device,
        logoFile: getLogoFilename(device.os),
    };
}

/**
 * Map a User-Agent string to a fastfetch small logo filename.
 */
export { getLogoFilename };
