"use client";

import { useEffect, useState } from "react";
import type { VisitorInfo } from "@/lib/visitor";

function maskIP(ip: string): string {
    const ipv4 = ip.match(/^(\d+\.\d+)\.\d+\.\d+$/);
    if (ipv4) return `${ipv4[1]}.x.x`;
    const ipv6 = ip.match(/^([0-9a-f:]+:[0-9a-f:]+)/i);
    if (ipv6) return `${ipv6[1]}:...`;
    return ip;
}

function buildTerminalOutput(info: VisitorInfo): string {
    const loc = [info.city, info.country].filter(Boolean).join(", ");
    return `$ curl -s https://blog.022025.xyz/api/visitor-info\n{\n  "ip": "${maskIP(info.ip)}",\n  "loc": "${loc}",\n  "isp": "${info.isp}",\n  "status": "authorized"\n}`;
}

export function VisitorTerminal() {
    const [visitorInfo, setVisitorInfo] = useState<VisitorInfo | null>(null);
    const [display, setDisplay] = useState("");
    const [done, setDone] = useState(false);

    // Fetch visitor info once
    useEffect(() => {
        const ctrl = new AbortController();
        const start = () => {
            fetch("/api/visitor-info", { signal: ctrl.signal })
                .then((r) =>
                    r.ok
                        ? (r.json() as Promise<{
                              visitorInfo?: VisitorInfo | null;
                          }>)
                        : Promise.reject(new Error(`HTTP ${r.status}`)),
                )
                .then((data) => {
                    if (data.visitorInfo) setVisitorInfo(data.visitorInfo);
                })
                .catch((e) => {
                    if (e?.name === "AbortError") return;
                });
        };
        const idle = window as unknown as {
            requestIdleCallback?: (
                cb: () => void,
                opts?: { timeout: number },
            ) => number;
            cancelIdleCallback?: (id: number) => void;
        };
        if (idle.requestIdleCallback) {
            const id = idle.requestIdleCallback(start, { timeout: 2000 });
            return () => {
                idle.cancelIdleCallback?.(id);
                ctrl.abort();
            };
        }
        const timer = setTimeout(start, 1500);
        return () => {
            clearTimeout(timer);
            ctrl.abort();
        };
    }, []);

    // Typewriter effect
    const output = visitorInfo ? buildTerminalOutput(visitorInfo) : null;
    useEffect(() => {
        if (!output) return;

        let i = 0;
        const interval = setInterval(() => {
            i++;
            setDisplay(output.slice(0, i));
            if (i >= output.length) {
                clearInterval(interval);
                setDone(true);
            }
        }, 16);
        return () => clearInterval(interval);
    }, [output]);

    return (
        <div className="terminal-output">
            <pre>
                <code>
                    {output ? display : ""}
                    {output && !done && <span className="terminal-cursor" />}
                </code>
            </pre>
        </div>
    );
}
