"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface LLMModel {
    name: string;
    slug: string;
    release_date?: string;
    model_creator: {
        name: string;
    };
    evaluations: {
        // AA composite indices (0–100 scale)
        artificial_analysis_intelligence_index?: number | null;
        artificial_analysis_coding_index?: number | null;
        artificial_analysis_math_index?: number | null;
        // Raw benchmarks (0–1 in AA API, rounded to 3 decimals in cache, displayed as 0–100%)
        gpqa?: number | null;
        hle?: number | null;
        livecodebench?: number | null;
        scicode?: number | null;
        math_500?: number | null;
        aime?: number | null;
        aime_25?: number | null;
        ifbench?: number | null;
        lcr?: number | null;
        terminalbench_hard?: number | null;
        tau2?: number | null;
    };
    pricing: {
        price_1m_blended_3_to_1?: number | null;
        price_1m_input_tokens?: number | null;
        price_1m_output_tokens?: number | null;
    };
    median_output_tokens_per_second?: number | null;
    median_time_to_first_token_seconds?: number | null;
}

type SortKey = "intelligence" | "coding" | "math" | "speed" | "price";
type SortDir = "asc" | "desc";

interface Props {
    models: LLMModel[];
    expanded: boolean;
    onExpand?: () => void;
    onCollapse?: () => void;
}

const isMissing = (n: number | null | undefined): n is null | undefined =>
    n === undefined || n === null || Number.isNaN(n);

const fmtScore = (n: number | null | undefined): string =>
    isMissing(n) ? "—" : Math.round(n).toString();

const fmtPct = (n: number | null | undefined): string =>
    isMissing(n) ? "—" : `${(n * 100).toFixed(1)}%`;

const fmtPrice = (n: number | null | undefined): string =>
    isMissing(n) ? "—" : `$${n.toFixed(2)}`;

const fmtSpeed = (n: number | null | undefined): string =>
    isMissing(n) ? "—" : `${n.toFixed(1)} t/s`;

const fmtTime = (n: number | null | undefined): string =>
    isMissing(n) ? "—" : `${n.toFixed(1)} s`;

const fmtDate = (s: string | undefined): string => {
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
};

const fmtDateAgo = (s: string | undefined): string => {
    if (!s) return "";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (days < 0) return "upcoming";
    if (days === 0) return "today";
    if (days === 1) return "1 day ago";
    if (days < 30) return `${days} days ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
};

// Scores/speed: higher is better (default desc). Price: cheaper is better (default asc).
const defaultDir = (key: SortKey): SortDir =>
    key === "price" ? "asc" : "desc";

const getSortValue = (m: LLMModel, key: SortKey): number | undefined => {
    const raw: number | null | undefined = (() => {
        switch (key) {
            case "intelligence":
                return m.evaluations.artificial_analysis_intelligence_index;
            case "coding":
                return m.evaluations.artificial_analysis_coding_index;
            case "math":
                return m.evaluations.artificial_analysis_math_index;
            case "speed":
                return m.median_output_tokens_per_second;
            case "price":
                return m.pricing.price_1m_blended_3_to_1;
        }
    })();
    return isMissing(raw) ? undefined : raw;
};

export function LLMLeaderboardPanel({
    models,
    expanded,
    onExpand,
    onCollapse,
}: Props) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const detailRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState("");
    const [creator, setCreator] = useState<string>("All");
    const [sortKey, setSortKey] = useState<SortKey>("intelligence");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const [selectedModel, setSelectedModel] = useState<LLMModel | null>(null);

    // Unique creators, sorted alphabetically with "All" first.
    const creators = useMemo(() => {
        const set = new Set<string>();
        models.forEach((m) => set.add(m.model_creator.name));
        return ["All", ...Array.from(set).sort()];
    }, [models]);

    const filtered = useMemo(() => {
        let arr: LLMModel[] = models;
        if (creator !== "All") {
            arr = arr.filter((m) => m.model_creator.name === creator);
        }
        if (query.trim()) {
            const q = query.trim().toLowerCase();
            arr = arr.filter(
                (m) =>
                    m.name.toLowerCase().includes(q) ||
                    m.model_creator.name.toLowerCase().includes(q) ||
                    m.slug.toLowerCase().includes(q),
            );
        }
        const sorted = [...arr].sort((a, b) => {
            const av = getSortValue(a, sortKey);
            const bv = getSortValue(b, sortKey);
            // Missing values always sink to the bottom regardless of direction.
            if (av === undefined && bv === undefined) return 0;
            if (av === undefined) return 1;
            if (bv === undefined) return -1;
            return sortDir === "desc" ? bv - av : av - bv;
        });
        return sorted;
    }, [models, query, creator, sortKey, sortDir]);

    const top = filtered.slice(0, 50);
    const hasFilters = creator !== "All" || query.trim() !== "";

    // ESC: close detail first, then main modal.
    useEffect(() => {
        if (!expanded) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (selectedModel) setSelectedModel(null);
                else onCollapse?.();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [expanded, onCollapse, selectedModel]);

    // Clear selected model when the main panel is closed so it doesn't reappear on reopen.
    useEffect(() => {
        if (!expanded) setSelectedModel(null);
    }, [expanded]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === "desc" ? "asc" : "desc"));
        } else {
            setSortKey(key);
            setSortDir(defaultDir(key));
        }
    };

    const handleClose = () => onCollapse?.();
    const handleCloseDetail = () => setSelectedModel(null);
    const clearFilters = () => {
        setQuery("");
        setCreator("All");
    };

    return (
        <>
            {/* Main expanded view */}
            {expanded &&
                typeof document !== "undefined" &&
                createPortal(
                    <div
                        ref={overlayRef}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/60 backdrop-blur-sm"
                        onClick={(e) => {
                            if (e.target === overlayRef.current) handleClose();
                        }}
                    >
                        <div
                            className="bg-bg-card/95 border border-border rounded-2xl shadow-2xl w-full max-w-6xl max-h-[85vh] flex flex-col overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <header className="flex items-start justify-between p-5 border-b border-border shrink-0">
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
                                        top models by intelligence ·{" "}
                                        {models.length} models · refreshes every
                                        30 min
                                    </p>
                                </div>
                                <button
                                    onClick={handleClose}
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

                            {/* Toolbar: search + creator chips */}
                            {models.length > 0 && (
                                <div className="p-4 border-b border-border space-y-3 shrink-0">
                                    <div className="relative">
                                        <svg
                                            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <circle cx="11" cy="11" r="7" />
                                            <path
                                                d="M21 21l-4.3-4.3"
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                        <input
                                            type="text"
                                            value={query}
                                            onChange={(e) =>
                                                setQuery(e.target.value)
                                            }
                                            placeholder="Search model, creator, or slug…"
                                            className="w-full bg-bg-secondary/50 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                                        />
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {creators.map((c) => (
                                            <button
                                                key={c}
                                                onClick={() => setCreator(c)}
                                                className={cn(
                                                    "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                                                    creator === c
                                                        ? "bg-accent text-bg-primary"
                                                        : "bg-bg-secondary/60 text-text-muted hover:text-text-primary hover:bg-bg-secondary",
                                                )}
                                            >
                                                {c}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Table */}
                            <div className="flex-1 overflow-y-auto">
                                {models.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-48 text-text-muted text-sm gap-2">
                                        <span>No data yet.</span>
                                        <span className="text-xs">
                                            The cache worker populates this
                                            every 30 min.
                                        </span>
                                    </div>
                                ) : top.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-48 text-text-muted text-sm gap-2">
                                        <span>
                                            No models match your filters.
                                        </span>
                                        <button
                                            onClick={clearFilters}
                                            className="text-xs text-accent hover:text-accent-hover"
                                        >
                                            Clear filters
                                        </button>
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
                                                    <SortHeader
                                                        active={
                                                            sortKey ===
                                                            "intelligence"
                                                        }
                                                        dir={sortDir}
                                                        onClick={() =>
                                                            handleSort(
                                                                "intelligence",
                                                            )
                                                        }
                                                    >
                                                        Intelligence
                                                    </SortHeader>
                                                </th>
                                                <th className="text-right py-3 px-4 font-medium hidden sm:table-cell">
                                                    <SortHeader
                                                        active={
                                                            sortKey === "coding"
                                                        }
                                                        dir={sortDir}
                                                        onClick={() =>
                                                            handleSort("coding")
                                                        }
                                                    >
                                                        Coding
                                                    </SortHeader>
                                                </th>
                                                <th className="text-right py-3 px-4 font-medium hidden sm:table-cell">
                                                    <SortHeader
                                                        active={
                                                            sortKey === "math"
                                                        }
                                                        dir={sortDir}
                                                        onClick={() =>
                                                            handleSort("math")
                                                        }
                                                    >
                                                        Math
                                                    </SortHeader>
                                                </th>
                                                <th className="text-right py-3 px-4 font-medium hidden lg:table-cell">
                                                    <SortHeader
                                                        active={
                                                            sortKey === "speed"
                                                        }
                                                        dir={sortDir}
                                                        onClick={() =>
                                                            handleSort("speed")
                                                        }
                                                    >
                                                        Speed
                                                    </SortHeader>
                                                </th>
                                                <th className="text-right py-3 px-4 font-medium">
                                                    <SortHeader
                                                        active={
                                                            sortKey === "price"
                                                        }
                                                        dir={sortDir}
                                                        onClick={() =>
                                                            handleSort("price")
                                                        }
                                                    >
                                                        $/M
                                                    </SortHeader>
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {top.map((m, i) => (
                                                <tr
                                                    key={m.slug}
                                                    onClick={() =>
                                                        setSelectedModel(m)
                                                    }
                                                    className="border-b border-border/40 hover:bg-bg-secondary/40 transition-colors cursor-pointer"
                                                >
                                                    <td className="py-2.5 px-4 text-text-muted font-mono">
                                                        {i + 1}
                                                    </td>
                                                    <td
                                                        className="py-2.5 px-4 text-text-primary font-medium truncate max-w-[260px]"
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
                                                    <td className="py-2.5 px-4 text-right text-text-muted font-mono hidden lg:table-cell">
                                                        {fmtSpeed(
                                                            m.median_output_tokens_per_second,
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
                                    Showing {top.length} of {filtered.length}
                                    {hasFilters &&
                                        ` (filtered from ${models.length} total)`}{" "}
                                    · source:{" "}
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

            {/* Detail modal */}
            {expanded &&
                selectedModel &&
                typeof document !== "undefined" &&
                createPortal(
                    <div
                        ref={detailRef}
                        className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                        onClick={(e) => {
                            if (e.target === detailRef.current)
                                handleCloseDetail();
                        }}
                    >
                        <div
                            className="bg-bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <header className="flex items-start justify-between p-5 border-b border-border shrink-0 gap-3">
                                <div className="min-w-0 flex-1">
                                    <h3
                                        className="text-xl font-bold text-text-primary truncate"
                                        title={selectedModel.name}
                                    >
                                        {selectedModel.name}
                                    </h3>
                                    <p className="text-xs text-text-muted mt-1 flex flex-wrap items-center gap-x-2">
                                        <span>
                                            {selectedModel.model_creator.name}
                                        </span>
                                        <span>·</span>
                                        <span className="font-mono">
                                            {selectedModel.slug}
                                        </span>
                                        {selectedModel.release_date && (
                                            <>
                                                <span>·</span>
                                                <span>
                                                    released{" "}
                                                    {fmtDate(
                                                        selectedModel.release_date,
                                                    )}{" "}
                                                    (
                                                    {fmtDateAgo(
                                                        selectedModel.release_date,
                                                    )}
                                                    )
                                                </span>
                                            </>
                                        )}
                                    </p>
                                </div>
                                <button
                                    onClick={handleCloseDetail}
                                    className="w-9 h-9 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors shrink-0"
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

                            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                                {/* Hero score */}
                                <div className="flex items-center gap-5 p-4 rounded-xl bg-bg-secondary/40 border border-border/60">
                                    <div className="text-5xl font-bold text-accent font-mono shrink-0">
                                        {fmtScore(
                                            selectedModel.evaluations
                                                .artificial_analysis_intelligence_index,
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-sm text-text-primary font-medium">
                                            Intelligence Index
                                        </div>
                                        <div className="text-xs text-text-muted mt-0.5">
                                            Artificial Analysis composite
                                            (0–100)
                                        </div>
                                    </div>
                                </div>

                                {/* Grouped benchmarks */}
                                <Benchmarks evals={selectedModel.evaluations} />

                                {/* Pricing + Performance side by side */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="p-4 rounded-xl bg-bg-secondary/40 border border-border/60">
                                        <div className="text-xs uppercase text-text-muted mb-2 tracking-wider">
                                            Pricing
                                        </div>
                                        <div className="space-y-1.5 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-text-muted">
                                                    Input
                                                </span>
                                                <span className="font-mono text-text-primary">
                                                    {fmtPrice(
                                                        selectedModel.pricing
                                                            .price_1m_input_tokens,
                                                    )}
                                                    <span className="text-text-muted text-xs">
                                                        {" "}
                                                        /1M
                                                    </span>
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-text-muted">
                                                    Output
                                                </span>
                                                <span className="font-mono text-text-primary">
                                                    {fmtPrice(
                                                        selectedModel.pricing
                                                            .price_1m_output_tokens,
                                                    )}
                                                    <span className="text-text-muted text-xs">
                                                        {" "}
                                                        /1M
                                                    </span>
                                                </span>
                                            </div>
                                            <div className="flex justify-between border-t border-border/60 pt-1.5 mt-1.5">
                                                <span className="text-text-muted">
                                                    Blended 3:1
                                                </span>
                                                <span className="font-mono text-text-primary">
                                                    {fmtPrice(
                                                        selectedModel.pricing
                                                            .price_1m_blended_3_to_1,
                                                    )}
                                                    <span className="text-text-muted text-xs">
                                                        {" "}
                                                        /1M
                                                    </span>
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-bg-secondary/40 border border-border/60">
                                        <div className="text-xs uppercase text-text-muted mb-2 tracking-wider">
                                            Performance
                                        </div>
                                        <div className="space-y-1.5 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-text-muted">
                                                    Speed
                                                </span>
                                                <span className="font-mono text-text-primary">
                                                    {fmtSpeed(
                                                        selectedModel.median_output_tokens_per_second,
                                                    )}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-text-muted">
                                                    Time to first token
                                                </span>
                                                <span className="font-mono text-text-primary">
                                                    {fmtTime(
                                                        selectedModel.median_time_to_first_token_seconds,
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Link */}
                                <a
                                    href={`https://artificialanalysis.ai/models/${selectedModel.slug}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full text-center px-4 py-2.5 rounded-lg bg-accent text-bg-primary font-medium text-sm hover:bg-accent-hover transition-colors"
                                >
                                    View on artificialanalysis.ai ↗
                                </a>
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
}

function SortHeader({
    children,
    onClick,
    active,
    dir,
}: {
    children: React.ReactNode;
    onClick: () => void;
    active: boolean;
    dir: SortDir;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "inline-flex items-center gap-1 transition-colors cursor-pointer",
                "hover:text-text-primary",
                active ? "text-accent" : "text-text-muted",
            )}
        >
            <span>{children}</span>
            <span className="text-[0.7em] opacity-70 w-2.5 text-left">
                {active ? (dir === "desc" ? "▼" : "▲") : "↕"}
            </span>
        </button>
    );
}

function Benchmarks({ evals }: { evals: LLMModel["evaluations"] }) {
    return (
        <div className="space-y-3.5">
            <BenchmarkGroup title="Reasoning">
                <BenchmarkRow label="GPQA" value={fmtPct(evals.gpqa)} />
                <BenchmarkRow
                    label="HLE (Humanity's Last Exam)"
                    value={fmtPct(evals.hle)}
                />
            </BenchmarkGroup>
            <BenchmarkGroup title="Coding">
                <BenchmarkRow
                    label="AA Coding Index"
                    value={fmtScore(evals.artificial_analysis_coding_index)}
                />
                <BenchmarkRow label="SciCode" value={fmtPct(evals.scicode)} />
                <BenchmarkRow
                    label="TerminalBench-Hard"
                    value={fmtPct(evals.terminalbench_hard)}
                />
                <BenchmarkRow
                    label="LiveCodeBench"
                    value={fmtPct(evals.livecodebench)}
                />
            </BenchmarkGroup>
            <BenchmarkGroup title="Tool Use">
                <BenchmarkRow label="τ²-bench" value={fmtPct(evals.tau2)} />
                <BenchmarkRow label="IFBench" value={fmtPct(evals.ifbench)} />
                <BenchmarkRow
                    label="LCR (Long-Context Retrieval)"
                    value={fmtPct(evals.lcr)}
                />
            </BenchmarkGroup>
            <BenchmarkGroup title="Math">
                <BenchmarkRow
                    label="AA Math Index"
                    value={fmtScore(evals.artificial_analysis_math_index)}
                />
                <BenchmarkRow label="MATH-500" value={fmtPct(evals.math_500)} />
                <BenchmarkRow label="AIME" value={fmtPct(evals.aime)} />
                <BenchmarkRow label="AIME-25" value={fmtPct(evals.aime_25)} />
            </BenchmarkGroup>
        </div>
    );
}

function BenchmarkGroup({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <div className="text-xs uppercase text-text-muted tracking-wider mb-1.5 font-medium">
                {title}
            </div>
            <div className="space-y-1 text-sm">{children}</div>
        </div>
    );
}

function BenchmarkRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between items-baseline gap-3">
            <span className="text-text-muted truncate">{label}</span>
            <span className="text-text-primary font-mono shrink-0">
                {value}
            </span>
        </div>
    );
}
