"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import type { VisitorInfo } from "@/lib/visitor";
import { getLogoText } from "@/lib/logos.generated";

/** If a string exceeds maxLen, truncate and replace the last 3 chars with … */
function cap(s: string, maxLen: number): string {
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen - 1) + "…";
}

// ── helpers ──────────────────────────────────────────────────────────

function maskIP(ip: string): string {
    const ipv4 = ip.match(/^(\d+\.\d+)\.\d+\.\d+$/);
    if (ipv4) return `${ipv4[1]}.x.x`;
    return ip;
}

interface CharEntry {
    ch: string;
    css: string;
}

function parseLogoToEntries(logo: string): CharEntry[] {
    const out: CharEntry[] = [];
    let active = "";
    for (let i = 0; i < logo.length; i++) {
        if (
            logo[i] === "$" &&
            i + 1 < logo.length &&
            logo[i + 1] >= "1" &&
            logo[i + 1] <= "5"
        ) {
            active = `logo-c${logo[i + 1]}`;
            i++;
            continue;
        }
        out.push({ ch: logo[i], css: active });
    }
    return out;
}

const DESKTOP_MAX_RIGHT = 42;
const MIN_TERMINAL_CHARS = 55;
const MAX_TERMINAL_CHARS = 67;

function buildDisplay(
    info: VisitorInfo,
    logoText: string,
    maxRight: number,
): { entries: CharEntry[]; totalChars: number } {
    // ── info lines ────────────────────────────────────────────────
    const loc = [info.city, info.country].filter(Boolean).join(", ") || "Earth";
    const isp = info.isp || "Interdimensional Proxy";
    const device =
        [info.browser, info.os].filter(Boolean).join(" / ") ||
        "Ancient Artifact";

    const separatorLen = Math.min(30, maxRight);
    const infoLines: string[] = [
        cap("visitor@kurashizu-blog", maxRight),
        "─".repeat(separatorLen),
        cap(`IP        ${maskIP(info.ip)}`, maxRight),
        cap(`Location  ${loc}`, maxRight),
        cap(`ISP       ${isp}`, maxRight),
        cap(`Device    ${device}`, maxRight),
        cap(`Status    authorized`, maxRight),
    ];

    // ── logo lines ────────────────────────────────────────────────
    const logoLines = logoText ? logoText.split("\n") : [];
    const padded: string[] = [];
    for (let i = 0; i < 7; i++) {
        padded[i] = i < logoLines.length ? logoLines[i] : "";
    }

    const cleanedWidths = padded.map((l) => l.replace(/\$\d/g, "").length);
    const maxLogoWidth = Math.max(...cleanedWidths, 0);
    const colGap = maxLogoWidth > 0 ? 4 : 0;

    const totalChars = Math.min(
        Math.max(maxLogoWidth + colGap + maxRight, MIN_TERMINAL_CHARS),
        MAX_TERMINAL_CHARS,
    );

    // ── interleave ───────────────────────────────────────────────
    const entries: CharEntry[] = [];
    for (let line = 0; line < 7; line++) {
        entries.push(...parseLogoToEntries(padded[line]));

        const actualWidth = padded[line].replace(/\$\d/g, "").length;
        const padCount = maxLogoWidth - actualWidth + colGap;
        for (let p = 0; p < padCount; p++) {
            entries.push({ ch: " ", css: "" });
        }

        for (const ch of infoLines[line] ?? "") {
            entries.push({ ch, css: "" });
        }

        if (line < 6) {
            entries.push({ ch: "\n", css: "" });
        }
    }

    return { entries, totalChars };
}

// ── component ────────────────────────────────────────────────────────

export function VisitorTerminal() {
    const [visitorInfo, setVisitorInfo] = useState<VisitorInfo | null>(null);
    const [revealed, setRevealed] = useState(0);
    const [done, setDone] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Resolved logo text (sync from bundled map)
    const logoText = useMemo(
        () => (visitorInfo ? getLogoText(visitorInfo.logoFile) : ""),
        [visitorInfo],
    );

    // Logo's widest line width (cleaned)
    const maxLogoWidth = useMemo(() => {
        if (!logoText) return 0;
        return Math.max(
            ...logoText.split("\n").map((l) => l.replace(/\$\d/g, "").length),
            0,
        );
    }, [logoText]);

    // Determine mode: fill screen on mobile, content-width on desktop
    const [effectiveMaxRight, setEffectiveMaxRight] =
        useState(DESKTOP_MAX_RIGHT);

    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper || maxLogoWidth === 0) return;

        const measure = () => {
            // Measure the actual pixel width of one character
            const probe = document.createElement("span");
            probe.style.cssText =
                "font-size:0.8125rem;font-weight:500;position:absolute;visibility:hidden";
            probe.textContent = "0";
            document.body.appendChild(probe);
            const chW = probe.getBoundingClientRect().width;
            document.body.removeChild(probe);

            const wrapperW = wrapper.clientWidth;
            const availableChars = Math.floor(wrapperW / chW);
            const naturalChars = maxLogoWidth + 4 + DESKTOP_MAX_RIGHT;

            if (availableChars >= naturalChars) {
                // Desktop: plenty of room — use standard 42-char info
                setEffectiveMaxRight(DESKTOP_MAX_RIGHT);
            } else {
                // Mobile: fill screen, shrink info column to fit
                const infoChars = Math.max(
                    18,
                    availableChars - maxLogoWidth - 4,
                );
                setEffectiveMaxRight(infoChars);
            }
        };

        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(wrapper);
        return () => ro.disconnect();
    }, [maxLogoWidth]);

    // Build display with the effective maxRight
    const { entries, totalChars } = useMemo(
        () =>
            visitorInfo
                ? buildDisplay(visitorInfo, logoText, effectiveMaxRight)
                : { entries: [], totalChars: 0 },
        [visitorInfo, logoText, effectiveMaxRight],
    );

    // Typewriter
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
        }, 10);
        return () => clearInterval(interval);
    }, [entries]);

    const visible = entries.slice(0, revealed);
    const isFill = effectiveMaxRight < DESKTOP_MAX_RIGHT;

    return (
        <div ref={wrapperRef} className="w-full">
            <div
                className="terminal-output"
                style={{
                    width: isFill ? "100%" : `${totalChars}ch`,
                }}
            >
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
        </div>
    );
}
