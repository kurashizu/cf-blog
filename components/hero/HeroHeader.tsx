"use client";

import { useEffect, useState } from "react";

interface HeroHeaderProps {
    title: string;
}

function formatHour(hour: number): string {
    const period = hour < 12 ? "AM" : "PM";
    const h = hour % 12 || 12;
    return `${h} ${period}`;
}

function getTitlePool(hour: number): string[] {
    if (hour < 5) {
        return [
            `Still awake at ${formatHour(hour)}?`,
            "Burning the midnight oil",
            "Sleep is for the weak",
            "Night owl mode activated",
        ];
    }
    if (hour < 8) {
        return [
            "Rise and shine... or just rise",
            "Early bird catches the bug",
            "Is that the sun or a monitor glare?",
            "5 AM: the quietest time to debug",
        ];
    }
    if (hour < 12) {
        return [
            "Coffee first, code later",
            "Good morning, world... and bugs",
            "Morning pages > morning coffee",
            "Another day, another stack trace",
        ];
    }
    if (hour < 17) {
        return [
            "Another day, another bug",
            "Post-lunch code coma",
            "Half the caffeine, double the bugs",
            "Afternoon: where features go to die",
        ];
    }
    if (hour < 21) {
        return [
            "You should probably sleep",
            "One more commit...",
            `It's ${formatHour(hour)}, do you know where your semicolons are?`,
            "The production is fine... I think",
        ];
    }
    return [
        "When the moon codes",
        "Night mode: 100% less distractions",
        "The night is still young, the bugs are many",
        "Real developers code under moonlight",
    ];
}

function pickTitle(hour: number): string {
    const pool = getTitlePool(hour);
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Hero header with flowing gradient animation on the title.
 * Displays a time-based dynamic title on the client.
 * Respects `prefers-reduced-motion`.
 */
export function HeroHeader({ title: fallback }: HeroHeaderProps) {
    const [title, setTitle] = useState(fallback);

    useEffect(() => {
        setTitle(pickTitle(new Date().getHours()));
    }, []);

    return (
        <h1
            className="hero-title hero-title--animated animate-fade-up"
            style={{ animationDelay: "0ms" }}
            aria-label={title}
        >
            {title}
        </h1>
    );
}
