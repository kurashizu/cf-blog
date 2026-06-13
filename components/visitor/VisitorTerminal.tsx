"use client";

import { useEffect, useState } from "react";
import type { VisitorInfo } from "@/lib/visitor";

interface VisitorTerminalProps {
    info: VisitorInfo;
    startDelayMs: number;
    charDelayMs: number;
}

function maskIP(ip: string): string {
    const ipv4 = ip.match(/^(\d+\.\d+)\.\d+\.\d+$/);
    if (ipv4) return `${ipv4[1]}.x.x`;
    const ipv6 = ip.match(/^([0-9a-f:]+:[0-9a-f:]+)/i);
    if (ipv6) return `${ipv6[1]}:...`;
    return ip;
}

function buildTerminalOutput(info: VisitorInfo): string {
    const loc = [info.city, info.country].filter(Boolean).join(", ");
    return `$ curl -s https://blog.022025.xyz/trace\n{\n  "ip": "${maskIP(info.ip)}",\n  "loc": "${loc}",\n  "isp": "${info.isp}",\n  "status": "authorized"\n}`;
}

export function VisitorTerminal({
    info,
    startDelayMs,
    charDelayMs,
}: VisitorTerminalProps) {
    const output = buildTerminalOutput(info);
    const [display, setDisplay] = useState("");
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const startTimer = setTimeout(() => {
            let i = 0;
            const interval = setInterval(() => {
                i++;
                setDisplay(output.slice(0, i));
                if (i >= output.length) {
                    clearInterval(interval);
                    setDone(true);
                }
            }, charDelayMs);
            return () => clearInterval(interval);
        }, startDelayMs);

        return () => clearTimeout(startTimer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startDelayMs, charDelayMs]);

    return (
        <pre className="terminal-output">
            <code>
                {display}
                {!done && <span className="terminal-cursor" />}
            </code>
        </pre>
    );
}
