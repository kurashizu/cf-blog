"use client";

import { useEffect } from "react";

const STAGES: { afterMs: number; title: string }[] = [
    { afterMs: 60_000, title: "Still here?" },
    { afterMs: 120_000, title: "You're still here?" },
    { afterMs: 300_000, title: "This page is not that interesting..." },
    { afterMs: 600_000, title: "Are you okay?" },
    { afterMs: 1_800_000, title: "Go touch some grass" },
    {
        afterMs: 3_600_000,
        title: "You've been here for an hour. I'm concerned.",
    },
];

export function StayEasterEgg() {
    useEffect(() => {
        const original = document.title;
        const timeouts: ReturnType<typeof setTimeout>[] = [];

        for (const stage of STAGES) {
            const id = setTimeout(() => {
                document.title = stage.title;
            }, stage.afterMs);
            timeouts.push(id);
        }

        return () => {
            document.title = original;
            for (const id of timeouts) clearTimeout(id);
        };
    }, []);

    return null;
}
