"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/ThemeProvider";

const themeMap: Record<string, string> = {
    dark: "r",
    "deep-blue": "b",
    "deep-green": "g",
};

export interface LLMModel {
    id: string;
    name: string;
    slug: string;
    model_creator: {
        id: string;
        name: string;
        slug: string;
    };
    evaluations: {
        artificial_analysis_intelligence_index?: number;
        artificial_analysis_coding_index?: number;
        artificial_analysis_math_index?: number;
        mmlu_pro?: number;
        gpqa?: number;
        hle?: number;
    };
    pricing: {
        price_1m_blended_3_to_1?: number;
        price_1m_input_tokens?: number;
        price_1m_output_tokens?: number;
    };
    median_output_tokens_per_second?: number;
    median_time_to_first_token_seconds?: number;
}

interface Props {
    models: LLMModel[];
    expanded: boolean;
    onExpand?: () => void;
    onCollapse?: () => void;
}

const fmtScore = (n: number | undefined): string =>
    n === undefined || n === null ? "—" : Math.round(n).toString();

const fmtPrice = (n: number | undefined): string =>
    n === undefined || n === null ? "—" : `$${n.toFixed(2)}`;

const fmtSpeed = (n: number | undefined): string =>
    n === undefined || n === null ? "—" : `${n.toFixed(1)} tok/s`;

const fmtTTFT = (n: number | undefined): string =>
    n === undefined || n === null ? "—" : `${(n * 1000).toFixed(0)} ms`;

export function LLMLeaderboardPanel({
    models,
    expanded,
    onExpand,
    onCollapse,
}: Props) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const prefix = themeMap[theme] ?? "r";

    useEffect(() => {
        if (!expanded) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCollapse?.();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [expanded, onCollapse]);

    const handleCollapse = () => onCollapse?.();
    const handleExpand = () => onExpand?.();

    const top = models.slice(0, 50);

    return (
        <>
            {/* Compact view — collapsed. Renders an inline button that mirrors KurAgent's pattern. */}
            {!expanded && (
                <button
                    onClick={handleExpand}
                    className="w-full h-full relative overflow-hidden rounded-xl group cursor-pointer flex flex-col items-center justify-center py-6"
                >
                    <div className="flex flex-col items-center z-20 group-hover:opacity-0 group-hover:-translate-y-2 transition-all duration-300">
                        <p
                            className="text-3xl font-bold text-text-primary"
                            style={{ fontFamily: "Pacifico, cursive" }}
                        >
                            LLM Board
                        </p>
                        <p className="text-base text-text-muted mt-1">
                            top models by intelligence
                        </p>
                    </div>

                    {/* Cover icon — fades in on hover */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <img
                            src={`/images/llm-board/${prefix}_0.png`}
                            alt=""
                            className="w-32 h-32 object-contain"
                            style={{
                                filter: "drop-shadow(0 0 12px var(--accent))",
                            }}
                        />
                    </div>
                </button>
            )}

            {/* Expanded view — full-screen portal overlay */}
            {expanded &&
                typeof document !== "undefined" &&
                createPortal(
                    <div
                        ref={overlayRef}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/60 backdrop-blur-sm"
                        onClick={(e) => {
                            if (e.target === overlayRef.current)
                                handleCollapse();
                        }}
                    >
                        <div
                            className="bg-bg-card/95 border border-border rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <header className="flex items-center justify-between p-5 border-b border-border shrink-0">
                                <div>
                                    <h2
                                        className="text-2xl font-bold text-text-primary"
                                        style={{
                                            fontFamily: "Pacifico, cursive",
                                        }}
                                    >
                                        LLM Board
                                    </h2>
                                    <p className="text-sm text-text-muted mt-0.5">
                                        top models by intelligence · refreshes
                                        every 30 min
                                    </p>
                                </div>
                                <button
                                    onClick={handleCollapse}
                                    className="w-9 h-9 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
                                    aria-label="Close"
                                >
                                    <svg
                                        className="w-5 h-5"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path
                                            d="M6 6l12 12M18 6L6 18"
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                </button>
                            </header>

                            <div className="flex-1 overflow-y-auto">
                                {models.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-48 text-text-muted text-sm gap-2">
                                        <span>No data yet.</span>
                                        <span className="text-xs">
                                            The cache worker populates this
                                            every 30 min.
                                        </span>
                                    </div>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-bg-card/95 backdrop-blur-sm border-b border-border z-10">
                                            <tr className="text-xs text-text-muted">
                                                <th className="text-left py-3 px-4 font-medium w-12">
                                                    #
                                                </th>
                                                <th className="text-left py-3 px-4 font-medium">
                                                    Model
                                                </th>
                                                <th className="text-left py-3 px-4 font-medium hidden md:table-cell">
                                                    Creator
                                                </th>
                                                <th className="text-right py-3 px-4 font-medium">
                                                    Intelligence
                                                </th>
                                                <th className="text-right py-3 px-4 font-medium hidden sm:table-cell">
                                                    Coding
                                                </th>
                                                <th className="text-right py-3 px-4 font-medium hidden sm:table-cell">
                                                    Math
                                                </th>
                                                <th className="text-right py-3 px-4 font-medium">
                                                    $/M
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {top.map((m, i) => (
                                                <tr
                                                    key={m.id}
                                                    className="border-b border-border/40 hover:bg-bg-secondary/40 transition-colors"
                                                >
                                                    <td className="py-2.5 px-4 text-text-muted font-mono">
                                                        {i + 1}
                                                    </td>
                                                    <td
                                                        className="py-2.5 px-4 text-text-primary font-medium truncate max-w-[200px]"
                                                        title={m.name}
                                                    >
                                                        {m.name}
                                                    </td>
                                                    <td className="py-2.5 px-4 text-text-muted text-xs truncate max-w-[140px] hidden md:table-cell">
                                                        {m.model_creator.name}
                                                    </td>
                                                    <td className="py-2.5 px-4 text-right text-accent font-mono">
                                                        {fmtScore(
                                                            m.evaluations
                                                                .artificial_analysis_intelligence_index,
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 px-4 text-right text-text-muted font-mono hidden sm:table-cell">
                                                        {fmtScore(
                                                            m.evaluations
                                                                .artificial_analysis_coding_index,
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 px-4 text-right text-text-muted font-mono hidden sm:table-cell">
                                                        {fmtScore(
                                                            m.evaluations
                                                                .artificial_analysis_math_index,
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 px-4 text-right text-text-muted font-mono">
                                                        {fmtPrice(
                                                            m.pricing
                                                                .price_1m_blended_3_to_1,
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {models.length > 0 && (
                                <footer className="p-3 border-t border-border text-xs text-text-muted text-center shrink-0">
                                    Showing top {Math.min(50, models.length)} of{" "}
                                    {models.length} models · source:{" "}
                                    <a
                                        href="https://artificialanalysis.ai"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-accent hover:text-accent-hover transition-colors"
                                    >
                                        artificialanalysis.ai
                                    </a>
                                </footer>
                            )}
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
}
