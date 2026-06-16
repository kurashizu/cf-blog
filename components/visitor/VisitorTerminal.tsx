"use client";

import { useEffect, useState, useMemo } from "react";
import type { VisitorInfo } from "@/lib/visitor";

// ── helpers ──────────────────────────────────────────────────────────

function maskIP(ip: string): string {
    const ipv4 = ip.match(/^(\d+\.\d+)\.\d+\.\d+$/);
    if (ipv4) return `${ipv4[1]}.x.x`;
    const ipv6 = ip.match(/^([0-9a-f:]+:[0-9a-f:]+)/i);
    if (ipv6) return `${ipv6[1]}:...`;
    return ip;
}

/**
 * Parse a raw logo string (with $N color markers) into an array of
 * character-level display entries. Non-`$N` characters inherit the
 * most recent active colour; `$N` markers set the colour for subsequent
 * chars and are not emitted as visible characters.
 */
interface CharEntry {
    ch: string;
    css: string; // CSS class name or ""
}

function parseLogoToEntries(logo: string): CharEntry[] {
    const out: CharEntry[] = [];
    let active = "";
    for (let i = 0; i < logo.length; i++) {
        // Detect $1 … $5 markers
        if (
            logo[i] === "$" &&
            i + 1 < logo.length &&
            logo[i + 1] >= "1" &&
            logo[i + 1] <= "5"
        ) {
            active = `logo-c${logo[i + 1]}`;
            i++; // skip the digit
            continue;
        }
        out.push({ ch: logo[i], css: active });
    }
    return out;
}

/**
 * Build the full display: left column (coloured ASCII logo) + right
 * column (fastfetch-style key-value info).
 */
interface BuildResult {
    entries: CharEntry[];
}

function buildDisplay(info: VisitorInfo): BuildResult {
    // ── right-column info lines (exactly 7) ──────────────────────
    const loc = [info.city, info.country].filter(Boolean).join(", ") || "Earth";
    const isp = info.isp || "Interdimensional Proxy";
    const device =
        [info.browser, info.os].filter(Boolean).join(" / ") ||
        "Ancient Artifact";

    // Each info line is capped at 42 characters so the right panel
    // has a predictable width regardless of content length.
    const MAX_RIGHT = 42;
    const infoLines = [
        "visitor@kurashizu-blog".slice(0, MAX_RIGHT),
        "─".repeat(MAX_RIGHT),
        `IP        ${maskIP(info.ip)}`.slice(0, MAX_RIGHT),
        `Location  ${loc}`.slice(0, MAX_RIGHT),
        `ISP       ${isp}`.slice(0, MAX_RIGHT),
        `Device    ${device}`.slice(0, MAX_RIGHT),
        `Status    authorized`.slice(0, MAX_RIGHT),
    ];

    // ── left-column logo lines (exactly 7, or empty) ─────────────
    const rawLogo = info.logo ?? "";
    const logoLines = rawLogo ? rawLogo.split("\n") : [];
    // Pad / truncate to 7 lines
    const padded: string[] = [];
    for (let i = 0; i < 7; i++) {
        padded[i] = i < logoLines.length ? logoLines[i] : "";
    }

    // Measure the widest cleaned line to set the column gap
    const cleanedWidths = padded.map((l) => l.replace(/\$\d/g, "").length);
    const maxLogoWidth = Math.max(...cleanedWidths, 0);
    const colGap = maxLogoWidth > 0 ? 4 : 0; // minimum gap between columns

    // ── interleave: logo char-by-char then info chars ────────────
    const entries: CharEntry[] = [];

    for (let line = 0; line < 7; line++) {
        // 1) logo part
        const logoLine = padded[line];
        const logoEntries = parseLogoToEntries(logoLine);
        entries.push(...logoEntries);

        // 2) padding to reach colGap beyond the logo column width
        const actualLogoWidth = logoLine.replace(/\$\d/g, "").length;
        const padCount = maxLogoWidth - actualLogoWidth + colGap;
        for (let p = 0; p < padCount; p++) {
            entries.push({ ch: " ", css: "" });
        }

        // 3) info part
        const infoLine = infoLines[line] ?? "";
        for (const ch of infoLine) {
            entries.push({ ch, css: "" });
        }

        // 4) newline (except after the last line)
        if (line < 6) {
            entries.push({ ch: "\n", css: "" });
        }
    }

    return { entries };
}

// ── component ────────────────────────────────────────────────────────

export function VisitorTerminal() {
    const [visitorInfo, setVisitorInfo] = useState<VisitorInfo | null>(null);
    const [revealed, setRevealed] = useState(0);
    const [done, setDone] = useState(false);

    // Fetch visitor info on mount
    useEffect(() => {
        const ctrl = new AbortController();
        fetch("/api/visitor-info", { signal: ctrl.signal })
            .then((r) =>
                r.ok
                    ? (r.json() as Promise<{ visitorInfo: VisitorInfo }>)
                    : Promise.reject(new Error(`HTTP ${r.status}`)),
            )
            .then((data) => {
                setVisitorInfo(data.visitorInfo);
            })
            .catch((e) => {
                if (e?.name === "AbortError") return;
            });
        return () => ctrl.abort();
    }, []);

    // Build character-level display once visitorInfo is available
    const { entries } = useMemo<BuildResult>(
        () => (visitorInfo ? buildDisplay(visitorInfo) : { entries: [] }),
        [visitorInfo],
    );

    // Typewriter effect
    useEffect(() => {
        if (entries.length === 0) return;
        setRevealed(0);
        setDone(false);
        let i = 0;
        const interval = setInterval(() => {
            i++;
            setRevealed(i);
            if (i >= entries.length) {
                clearInterval(interval);
                setDone(true);
            }
        }, 16);
        return () => clearInterval(interval);
    }, [entries]);

    const visible = entries.slice(0, revealed);

    return (
        <div className="terminal-output">
            <pre>
                <code>
                    {visible.map((e, i) => {
                        if (e.ch === "\n") return <br key={i} />;
                        if (e.ch === " ")
                            return (
                                <span key={i} className={e.css}>
                                    &nbsp;
                                </span>
                            );
                        return (
                            <span key={i} className={e.css}>
                                {e.ch}
                            </span>
                        );
                    })}
                    {entries.length > 0 && !done && (
                        <span className="terminal-cursor" />
                    )}
                </code>
            </pre>
        </div>
    );
}
