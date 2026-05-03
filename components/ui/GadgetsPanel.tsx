"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/ThemeProvider";
import { AgentPanel } from "@/components/agent/AgentPanel";

interface Gadget {
    id: string;
    title: string;
    slogan: string;
    isPlaceholder?: boolean;
}

const themeMap: Record<string, string> = {
    dark: "r",
    "deep-blue": "b",
    "deep-green": "g",
};

const gadgets: Gadget[] = [
    { id: "agent", title: "KurAgent", slogan: "kurashizu makes thinking act" },
    { id: "tool1", title: "Coming Soon", slogan: "Stay tuned", isPlaceholder: true },
    { id: "tool2", title: "Coming Soon", slogan: "Stay tuned", isPlaceholder: true },
    { id: "tool3", title: "Coming Soon", slogan: "Stay tuned", isPlaceholder: true },
];

function PlaceholderSVG({ index }: { index: number }) {
    if (index === 0) {
        return (
            <svg viewBox="0 0 100 100" className="w-full h-full" style={{ opacity: 0.3 }}>
                <polygon
                    points="50,8 58,38 90,38 64,58 73,88 50,70 27,88 36,58 10,38 42,38"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    opacity="0.6"
                />
                <circle cx="50" cy="50" r="28" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.3" />
                <text x="50" y="50" textAnchor="middle" dominantBaseline="middle" fill="var(--accent)" fontSize="7" opacity="0.5">?</text>
            </svg>
        );
    }
    if (index === 1) {
        return (
            <svg viewBox="0 0 100 100" className="w-full h-full" style={{ opacity: 0.3 }}>
                <polygon
                    points="50,10 86,28 86,68 50,86 14,68 14,28"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    opacity="0.6"
                />
                <circle cx="50" cy="48" r="18" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.3" />
                <line x1="50" y1="30" x2="50" y2="66" stroke="var(--accent)" strokeWidth="1" opacity="0.25" />
                <line x1="32" y1="48" x2="68" y2="48" stroke="var(--accent)" strokeWidth="1" opacity="0.25" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 100 100" className="w-full h-full" style={{ opacity: 0.3 }}>
            <polygon
                points="50,10 85,50 50,90 15,50"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinejoin="round"
                opacity="0.6"
            />
            <polygon
                points="50,25 70,50 50,75 30,50"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1"
                strokeLinejoin="round"
                opacity="0.3"
            />
            <circle cx="50" cy="50" r="6" fill="var(--accent)" opacity="0.2" />
        </svg>
    );
}

export function GadgetsPanel() {
    const { theme } = useTheme();
    const prefix = themeMap[theme] ?? "r";
    const [hoveredId, setHoveredId] = useState<string | null>("agent");
    const [showAgent, setShowAgent] = useState(false);

    const currentGadget = gadgets.find((g) => g.id === hoveredId) ?? gadgets[0];

    return (
        <div className="w-full h-full flex flex-col">
            <AgentPanel expanded={showAgent} onCollapse={() => setShowAgent(false)} />
            {/* 4 gadgets grid */}
            <div className="grid grid-cols-2 gap-3">
                {gadgets.map((gadget, idx) => (
                    <button
                        key={gadget.id}
                        className={cn(
                            "relative aspect-[264/235] flex items-center justify-center rounded-xl overflow-hidden transition-all duration-200",
                            hoveredId === gadget.id
                                ? "ring-1 ring-accent/40"
                                : "hover:ring-1 hover:ring-border"
                        )}
                        onMouseEnter={() => setHoveredId(gadget.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => {
                            if (!gadget.isPlaceholder) {
                                setShowAgent(true);
                            }
                        }}
                    >
                        {gadget.isPlaceholder ? (
                            <PlaceholderSVG index={idx - 1 >= 0 ? idx - 1 : 0} />
                        ) : (
                            <Image
                                src={`/images/kuragent/${prefix}_0.png`}
                                alt={gadget.title}
                                fill
                                className="object-contain rounded-xl"
                                style={{
                                    transform: hoveredId === gadget.id ? "scale(1.05)" : "scale(1)",
                                    transition: "transform 200ms ease-out",
                                    filter: "drop-shadow(0 0 10px var(--accent))",
                                }}
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* Info panel — bottom */}
            <div className="mt-4 flex flex-col items-center flex-1 justify-center">
                <div
                    key={currentGadget.id}
                    className="w-full flex flex-col items-center px-4"
                    style={{ animation: "fadeInUp 200ms ease-out forwards" }}
                >
                    <p
                        className="text-2xl font-bold text-text-primary w-full text-center truncate"
                        style={{
                            fontFamily: "Pacifico, cursive",
                            background: "linear-gradient(90deg, #ff0000, #00ff00, #0000ff, #ff0000)",
                            backgroundSize: "300% 100%",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                            animation: "rgbFlow 6s linear infinite",
                        }}
                    >
                        {currentGadget.title}
                    </p>
                    <p
                        className="text-sm text-text-muted mt-1 w-full text-center truncate"
                        style={{ fontFamily: "Pacifico, cursive" }}
                    >
                        {currentGadget.slogan}
                    </p>
                </div>
            </div>

            <style>{`
                @keyframes rgbFlow {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                @keyframes fadeInUp {
                    0% { opacity: 0; transform: translateY(8px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
