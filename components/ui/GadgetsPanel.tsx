"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/ThemeProvider";
import { AgentPanel } from "@/components/agent/AgentPanel";
import {
    LLMLeaderboardPanel,
    type LLMModel,
} from "@/components/llm/LLMLeaderboardPanel";

interface Gadget {
    id: string;
    title: string;
    slogan: string;
    isPlaceholder?: boolean;
    imageDir?: string;
    panel?: "agent" | "llm-board" | "nes";
    iconKind?: "image" | "controller";
}

const themeMap: Record<string, string> = {
    dark: "r",
    "deep-blue": "b",
    "deep-green": "g",
};

const gadgets: Gadget[] = [
    {
        id: "agent",
        title: "KurAgent",
        slogan: "kurashizu makes thinking act",
        imageDir: "kuragent",
        panel: "agent",
    },
    {
        id: "llm-board",
        title: "LLM Board",
        slogan: "top models by intelligence",
        imageDir: "llm-board",
        panel: "llm-board",
    },
    {
        id: "nes",
        title: "NES Emulator",
        slogan: "8-bit nostalgia in browser",
        panel: "nes",
        iconKind: "controller",
    },
    {
        id: "tool3",
        title: "Coming Soon",
        slogan: "Stay tuned",
        isPlaceholder: true,
    },
];

// jsnes + NESPanel live in a separate chunk. We only mount the component
// when the user actually opens the NES gadget (gated by `showNes` below),
// so the jsnes bundle is never fetched on the home page's initial load.
const NESPanel = dynamic(
    () => import("@/components/nes").then((m) => m.NESPanel),
    {
        ssr: false,
        loading: () => (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/60 backdrop-blur-sm animate-fadeIn">
                <div className="bg-bg-card/95 border border-border rounded-2xl shadow-2xl px-8 py-6">
                    <p className="text-text-primary text-sm font-medium">
                        Loading NES emulator…
                    </p>
                </div>
            </div>
        ),
    },
);

function PlaceholderSVG({ index }: { index: number }) {
    if (index === 0) {
        return (
            <svg
                viewBox="0 0 100 100"
                className="w-full h-full"
                style={{ opacity: 0.3 }}
            >
                <polygon
                    points="50,8 58,38 90,38 64,58 73,88 50,70 27,88 36,58 10,38 42,38"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    opacity="0.6"
                />
                <circle
                    cx="50"
                    cy="50"
                    r="28"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1"
                    opacity="0.3"
                />
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
        );
    }
    if (index === 1) {
        return (
            <svg
                viewBox="0 0 100 100"
                className="w-full h-full"
                style={{ opacity: 0.3 }}
            >
                <polygon
                    points="50,10 86,28 86,68 50,86 14,68 14,28"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    opacity="0.6"
                />
                <circle
                    cx="50"
                    cy="48"
                    r="18"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1"
                    opacity="0.3"
                />
                <line
                    x1="50"
                    y1="30"
                    x2="50"
                    y2="66"
                    stroke="var(--accent)"
                    strokeWidth="1"
                    opacity="0.25"
                />
                <line
                    x1="32"
                    y1="48"
                    x2="68"
                    y2="48"
                    stroke="var(--accent)"
                    strokeWidth="1"
                    opacity="0.25"
                />
            </svg>
        );
    }
    return (
        <svg
            viewBox="0 0 100 100"
            className="w-full h-full"
            style={{ opacity: 0.3 }}
        >
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

function ControllerIcon({ hovered }: { hovered: boolean }) {
    return (
        <svg
            viewBox="0 0 100 100"
            className="w-full h-full"
            style={{
                transform: hovered ? "scale(1.05)" : "scale(1)",
                transition: "transform 200ms ease-out",
                filter: "drop-shadow(0 0 10px var(--accent))",
            }}
        >
            {/* Cable */}
            <path
                d="M 50 38 Q 50 28 62 20"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.5"
                opacity="0.5"
            />
            {/* Body */}
            <rect
                x="15"
                y="38"
                width="70"
                height="30"
                rx="13"
                fill="var(--accent-subtle)"
                stroke="var(--accent)"
                strokeWidth="2"
            />
            {/* D-pad (cross) */}
            <rect
                x="24"
                y="49.5"
                width="16"
                height="5"
                rx="1"
                fill="var(--accent)"
                opacity="0.65"
            />
            <rect
                x="29.5"
                y="44"
                width="5"
                height="16"
                rx="1"
                fill="var(--accent)"
                opacity="0.65"
            />
            {/* A (top-right) */}
            <circle cx="66" cy="49" r="4" fill="var(--accent)" opacity="0.75" />
            {/* B (bottom-right) */}
            <circle cx="76" cy="58" r="4" fill="var(--accent)" opacity="0.75" />
        </svg>
    );
}

export function GadgetsPanel({ llmModels = [] }: { llmModels?: LLMModel[] }) {
    const { theme } = useTheme();
    const prefix = themeMap[theme] ?? "r";
    const [hoveredId, setHoveredId] = useState<string | null>("agent");
    const [showAgent, setShowAgent] = useState(false);
    const [showLlmBoard, setShowLlmBoard] = useState(false);
    const [showNes, setShowNes] = useState(false);

    const currentGadget = gadgets.find((g) => g.id === hoveredId) ?? gadgets[0];

    const handleClick = (gadget: Gadget) => {
        if (gadget.isPlaceholder) return;
        if (gadget.panel === "llm-board") {
            setShowLlmBoard(true);
        } else if (gadget.panel === "nes") {
            setShowNes(true);
        } else {
            setShowAgent(true);
        }
    };

    return (
        <div className="w-full h-full flex flex-col justify-center">
            <AgentPanel
                expanded={showAgent}
                onCollapse={() => setShowAgent(false)}
                onExpand={() => setShowAgent(true)}
            />
            <LLMLeaderboardPanel
                models={llmModels}
                expanded={showLlmBoard}
                onExpand={() => setShowLlmBoard(true)}
                onCollapse={() => setShowLlmBoard(false)}
            />
            {/* NESPanel is mounted only when the user opens the NES tile.
                Because next/dynamic defers the import until mount, jsnes
                (and the rest of components/nes/) is never fetched on the
                home page's initial load. */}
            {showNes && (
                <NESPanel
                    expanded={showNes}
                    onExpand={() => setShowNes(true)}
                    onCollapse={() => setShowNes(false)}
                />
            )}
            {/* 4 gadgets grid */}
            <div className="flex flex-col my-auto w-full">
                <div className="grid grid-cols-2 gap-3">
                    {gadgets.map((gadget, idx) => (
                        <button
                            key={gadget.id}
                            className={cn(
                                "relative aspect-[264/235] flex items-center justify-center rounded-xl overflow-hidden transition-all duration-200",
                                hoveredId === gadget.id
                                    ? "ring-1 ring-accent/40"
                                    : "hover:ring-1 hover:ring-border",
                            )}
                            onMouseEnter={() => setHoveredId(gadget.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            onClick={() => handleClick(gadget)}
                        >
                            {gadget.isPlaceholder ? (
                                <PlaceholderSVG
                                    index={idx - 1 >= 0 ? idx - 1 : 0}
                                />
                            ) : gadget.iconKind === "controller" ? (
                                <ControllerIcon
                                    hovered={hoveredId === gadget.id}
                                />
                            ) : (
                                <Image
                                    src={`/images/${gadget.imageDir ?? "kuragent"}/${prefix}_0.png`}
                                    alt={gadget.title}
                                    fill
                                    className="object-cover scale-[1.265] origin-top rounded-xl"
                                    unoptimized={
                                        gadget.imageDir === "llm-board"
                                    }
                                    style={{
                                        transform:
                                            hoveredId === gadget.id
                                                ? "scale(1.05)"
                                                : "scale(1)",
                                        transition: "transform 200ms ease-out",
                                        filter: "drop-shadow(0 0 10px var(--accent))",
                                    }}
                                />
                            )}
                        </button>
                    ))}
                </div>
                {/* Info panel — bottom */}
                <div className="mt-4 flex flex-col items-center justify-center">
                    <div
                        key={currentGadget.id}
                        className="w-full flex flex-col items-center px-4"
                        style={{
                            animation: "fadeInUp 200ms ease-out forwards",
                        }}
                    >
                        <p
                            className="text-2xl font-bold text-text-primary w-full text-center truncate"
                            style={{
                                fontFamily: "Pacifico, cursive",
                                background:
                                    "linear-gradient(90deg, #ff0000, #00ff00, #0000ff, #ff0000)",
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
                </div>{" "}
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
