"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import type { VisitorInfo } from "@/lib/visitor";
import { getLogoText } from "@/lib/logos.generated";

function cap(s: string, maxLen: number): string {
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen - 1) + "…";
}

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

function buildDisplay(info: VisitorInfo, logoText: string) {
    const loc = [info.city, info.country].filter(Boolean).join(", ") || "Earth";
    const isp = info.isp || "Interdimensional Proxy";
    const device =
        [info.browser, info.os].filter(Boolean).join(" / ") ||
        "Ancient Artifact";

    const infoLines: string[] = [
        cap("visitor@kurashizu-blog", DESKTOP_MAX_RIGHT),
        "─".repeat("visitor@kurashizu-blog".length),
        cap(`IP        ${maskIP(info.ip)}`, DESKTOP_MAX_RIGHT),
        cap(`Location  ${loc}`, DESKTOP_MAX_RIGHT),
        cap(`ISP       ${isp}`, DESKTOP_MAX_RIGHT),
        cap(`Device    ${device}`, DESKTOP_MAX_RIGHT),
        cap(`Status    authorized`, DESKTOP_MAX_RIGHT),
    ];

    const logoLines = logoText ? logoText.split("\n") : [];
    const padded: string[] = [];
    for (let i = 0; i < 7; i++) {
        padded[i] = i < logoLines.length ? logoLines[i] : "";
    }

    const cleanedWidths = padded.map((l) => l.replace(/\$\d/g, "").length);
    const maxLogoWidth = Math.max(...cleanedWidths, 0);
    const colGap = maxLogoWidth > 0 ? 4 : 0;

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

    return { entries };
}

export function VisitorTerminal() {
    const [visitorInfo, setVisitorInfo] = useState<VisitorInfo | null>(null);
    const [revealed, setRevealed] = useState(0);
    const [done, setDone] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    // Scale to fill wrapper when narrower than 520px
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const fit = () => {
            const w = wrapper.clientWidth;
            setScale((prev) => {
                const next = w < 520 ? w / 520 : 1;
                return Math.abs(prev - next) > 0.001 ? next : prev;
            });
        };

        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(wrapper);
        return () => ro.disconnect();
    }, []);

    // Fetch visitor info on mount
    useEffect(() => {
        const ctrl = new AbortController();
        fetch("/api/visitor-info", { signal: ctrl.signal })
            .then((r) =>
                r.ok
                    ? (r.json() as Promise<{ visitorInfo: VisitorInfo }>)
                    : Promise.reject(new Error(`HTTP ${r.status}`)),
            )
            .then((data) => setVisitorInfo(data.visitorInfo))
            .catch((e) => {
                if (e?.name === "AbortError") return;
            });
        return () => ctrl.abort();
    }, []);

    const logoText = useMemo(
        () => (visitorInfo ? getLogoText(visitorInfo.logoFile) : ""),
        [visitorInfo],
    );

    const { entries } = useMemo(
        () =>
            visitorInfo ? buildDisplay(visitorInfo, logoText) : { entries: [] },
        [visitorInfo, logoText],
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

    return (
        <div
            ref={wrapperRef}
            className="w-full overflow-hidden"
            style={{ height: scale < 1 ? `${11 * scale}rem` : "auto" }}
        >
            <div
                className="terminal-output"
                style={{
                    width: "520px",
                    transform: scale < 1 ? `scale(${scale})` : undefined,
                    transformOrigin: "top left",
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
