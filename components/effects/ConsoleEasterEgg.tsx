"use client";

import { useEffect } from "react";

const ACCENT = "#ff6b35";
const MUTED = "#606070";
const WHITE = "#e8e8ed";

export function ConsoleEasterEgg() {
    useEffect(() => {
        console.log(
            [
                `%c  ╔══════════════════════════════════╗  `,
                `%c  ║   DEVELOPER CONSOLE ACTIVATED    ║  `,
                `%c  ╚══════════════════════════════════╝  `,
                ``,
                `%c  --- you found the secret room ---`,
                ``,
                `%c  This blog runs on Next.js + Cloudflare Workers.`,
                `%c  Source: github.com/kurashizu/cf-blog`,
                ``,
                `%c  If you're reading this, you're probably`,
                `%c  debugging something. Good luck.`,
                ``,
                `%c  Nothing to see here. Carry on.`,
            ].join("\n"),
            `color: ${ACCENT}`,
            `color: ${WHITE}`,
            `color: ${ACCENT}`,
            `color: ${MUTED}`,
            `color: ${WHITE}`,
            `color: ${MUTED}`,
            `color: ${WHITE}`,
            `color: ${MUTED}`,
            `color: ${WHITE}`,
        );
    }, []);

    return null;
}
