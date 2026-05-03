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
    onClick?: () => void;
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

export function GadgetsPanel() {
    const { theme } = useTheme();
    const prefix = themeMap[theme] ?? "r";
    const [hoveredId, setHoveredId] = useState<string | null>("agent");
    const prevPrefixRef = useRef(prefix);
    const [imgOpacity, setImgOpacity] = useState(1);
    const [showAgent, setShowAgent] = useState(false);

    useEffect(() => {
        if (prevPrefixRef.current !== prefix) {
            prevPrefixRef.current = prefix;
            setImgOpacity(0);
            const timer = setTimeout(() => setImgOpacity(1), 300);
            return () => clearTimeout(timer);
        }
    }, [prefix]);

    const currentGadget = gadgets.find((g) => g.id === hoveredId) ?? gadgets[0];

    return (
        <div className="w-full h-full flex flex-col">
            <AgentPanel expanded={showAgent} onCollapse={() => setShowAgent(false)} />
            {/* 4 gadgets grid */}
            <div className="grid grid-cols-2 gap-3">
                {gadgets.map((gadget) => (
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
                            <svg
                                viewBox="0 0 100 100"
                                className="w-full h-full"
                                style={{ opacity: 0.3 }}
                            >
                                <defs>
                                    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.5" />
                                        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.1" />
                                    </linearGradient>
                                </defs>
                                <polygon
                                    points="50,8 58,38 90,38 64,58 73,88 50,70 27,88 36,58 10,38 42,38"
                                    fill="none"
                                    stroke="var(--accent)"
                                    strokeWidth="2"
                                    strokeLinejoin="round"
                                    opacity="0.6"
                                />
                                <circle cx="50" cy="50" r="28" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.3" />
                                <text
                                    x="50"
                                    y="50"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fill="var(--accent)"
                                    fontSize="7"
                                    opacity="0.5"
                                >
                                    ?
                                </text>
                            </svg>
                        ) : (
                            <Image
                                src={`/images/kuragent/${prefix}_0.png`}
                                alt={gadget.title}
                                fill
                                className="object-contain rounded-xl"
                                style={{
                                    opacity: imgOpacity,
                                    transition: "opacity 300ms ease-out",
                                    transform: hoveredId === gadget.id ? "scale(1.05)" : "scale(1)",
                                    transitionProperty: "opacity, transform",
                                    transitionDuration: "200ms, 200ms",
                                    filter: "drop-shadow(0 0 10px var(--accent))",
                                }}
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* Info panel — bottom, with fade transition */}
            <div className="mt-4 flex flex-col items-center flex-1 justify-center relative">
                <div
                    key={currentGadget.id}
                    className="flex flex-col items-center"
                    style={{
                        animation: "fadeInUp 300ms ease-out forwards",
                    }}
                >
                    <p
                        className="text-2xl font-bold text-text-primary"
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
                        className="text-sm text-text-muted mt-1"
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
