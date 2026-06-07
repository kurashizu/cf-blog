"use client";

import { useState, useCallback } from "react";
import {
    type HeatmapView,
    HEATMAP_CELL_SIZE,
    HEATMAP_STRIDE,
    HEATMAP_MONTH_LABEL_H,
    HEATMAP_PADDING_X,
    HEATMAP_PADDING_Y,
} from "@/lib/contributions";

interface ContributionsHeatmapProps {
    view: HeatmapView;
}

interface TooltipState {
    x: number;
    y: number;
    date: string;
    count: number;
    level: number;
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00Z");
    return d.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
    });
}

const LEVEL_LABELS = ["None", "Low", "Moderate", "High", "Very High"];

export function ContributionsHeatmap({ view }: ContributionsHeatmapProps) {
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);

    const showTooltip = useCallback(
        (e: React.MouseEvent<SVGRectElement>, cell: HeatmapView["cells"][number]) => {
            setTooltip({
                x: e.clientX,
                y: e.clientY,
                date: cell.date,
                count: cell.count,
                level: cell.level,
            });
        },
        [],
    );

    const moveTooltip = useCallback(
        (e: React.MouseEvent<SVGRectElement>, cell: HeatmapView["cells"][number]) => {
            setTooltip((prev) =>
                prev && prev.date === cell.date
                    ? { ...prev, x: e.clientX, y: e.clientY }
                    : prev,
            );
        },
        [],
    );

    const hideTooltip = useCallback(() => {
        setTooltip(null);
    }, []);

    if (view.cols === 0) return null;

    return (
        <div className="contributions-svg-wrap">
            <svg
                className="contributions-svg"
                width={view.width}
                height={view.height}
                viewBox={`0 0 ${view.width} ${view.height}`}
                role="img"
                aria-label="GitHub contribution activity for the recent days"
            >
                {view.monthLabels.map(({ col, label }) => (
                    <text
                        key={`m-${col}`}
                        x={HEATMAP_PADDING_X + col * HEATMAP_STRIDE}
                        y={HEATMAP_PADDING_Y + 10}
                        className="heat-month-label"
                    >
                        {label}
                    </text>
                ))}

                {view.cells.map((cell) => {
                    const x = HEATMAP_PADDING_X + cell.col * HEATMAP_STRIDE;
                    const y = HEATMAP_PADDING_Y + HEATMAP_MONTH_LABEL_H;
                    return (
                        <rect
                            key={cell.date}
                            x={x}
                            y={y}
                            width={HEATMAP_CELL_SIZE}
                            height={HEATMAP_CELL_SIZE}
                            rx={3}
                            className={`heat-cell heat-${cell.level}`}
                            onMouseEnter={(e) => showTooltip(e, cell)}
                            onMouseMove={(e) => moveTooltip(e, cell)}
                            onMouseLeave={hideTooltip}
                        >
                            <title>
                                {cell.count === 0
                                    ? `No contributions on ${cell.date}`
                                    : `${cell.count} ${cell.count === 1 ? "contribution" : "contributions"} on ${cell.date}`}
                            </title>
                        </rect>
                    );
                })}
            </svg>

            {tooltip && (
                <div
                    className="heat-tooltip"
                    style={{
                        left: tooltip.x + 14,
                        top: tooltip.y - 10,
                    }}
                >
                    <div className="heat-tooltip-date">{formatDate(tooltip.date)}</div>
                    <div className="heat-tooltip-count">
                        {tooltip.count}{" "}
                        {tooltip.count === 1 ? "contribution" : "contributions"}
                    </div>
                    <div className="heat-tooltip-bar">
                        <span
                            className={`heat-tooltip-level heat-tooltip-level-${tooltip.level}`}
                        >
                            {LEVEL_LABELS[tooltip.level]}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
