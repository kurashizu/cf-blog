/**
 * fetch_webpage tool — fetch URL and convert HTML to Markdown
 */
import { htmlToMarkdown } from "@/lib/html-to-md";

const MAX_SIZE = 500 * 1024; // 500KB

/**
 * Block requests to private/reserved/loopback addresses to prevent SSRF.
 * LLM-controlled input makes this a meaningful attack surface.
 */
function isPrivateHost(hostname: string): boolean {
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");

    if (
        h === "localhost" ||
        h === "ip6-localhost" ||
        h === "ip6-loopback" ||
        h === "metadata.google.internal" ||
        h.endsWith(".localhost") ||
        h.endsWith(".local") ||
        h.endsWith(".internal")
    ) {
        return true;
    }

    const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
        const a = Number(ipv4[1]);
        const b = Number(ipv4[2]);
        if (a === 0 || a === 127 || a >= 224) return true; // 0.0.0.0/8, 127.0.0.0/8, 224.0.0.0/4+, 240.0.0.0/4
        if (a === 10) return true; // 10.0.0.0/8
        if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
        if (a === 192 && b === 168) return true; // 192.168.0.0/16
        if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. cloud metadata)
        if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGN
        return false;
    }

    if (h === "::1" || h === "::") return true; // IPv6 loopback / unspecified
    if (h.startsWith("fe80:") || h.startsWith("fe80::")) return true; // link-local
    if (/^f[cd]/i.test(h)) return true; // fc00::/7 ULA
    if (h.startsWith("ff")) return true; // ff00::/8 multicast

    return false;
}

export const fetchWebpageTool = {
    name: "fetch_webpage",
    description:
        "Fetch a URL and convert the HTML content to clean Markdown format",
    example: '{"url": "https://example.com"}',

    parameters: {
        type: "object",
        properties: {
            url: {
                type: "string",
                description:
                    "URL to fetch (http or https only; private/loopback addresses are blocked)",
            },
        },
        required: ["url"],
    },

    execute: async (args: Record<string, unknown>) => {
        const url = args.url as string;

        if (typeof url !== "string") {
            return { success: false, error: "url must be a string" };
        }

        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            return { success: false, error: "Only http/https URLs allowed" };
        }

        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch {
            return { success: false, error: "Invalid URL" };
        }

        if (isPrivateHost(parsedUrl.hostname)) {
            return {
                success: false,
                error: "Private/loopback addresses are not allowed",
            };
        }

        let res: Response;
        try {
            res = await fetch(url, {
                headers: { "User-Agent": "cf-agent/1.0" },
                signal: AbortSignal.timeout(10000),
            });
        } catch {
            return { success: false, error: "Fetch failed" };
        }

        const contentType = res.headers.get("content-type") || "";
        const isHtml = !contentType.includes("json");

        if (!res.ok) {
            return { success: false, error: `HTTP ${res.status}` };
        }

        let text: string;
        try {
            text = await res.text();
        } catch {
            return { success: false, error: "Failed to read response" };
        }

        if (text.length > MAX_SIZE) {
            text = text.slice(0, MAX_SIZE);
        }

        if (isHtml) {
            const { title, content } = htmlToMarkdown(text);
            return {
                success: true,
                title,
                content,
                type: "markdown",
                status: res.status,
            };
        }

        return {
            success: true,
            content: text.slice(0, 1000),
            type: "text",
            status: res.status,
        };
    },
};
