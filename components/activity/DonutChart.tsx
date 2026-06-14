"use client";

import { useState } from "react";
import { type Language } from "@/lib/languages";

interface DonutChartProps {
    languages: Language[];
}

const SIZE = 130;
const STROKE_WIDTH = 14;
const CENTER = SIZE / 2;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DonutChart({ languages }: DonutChartProps) {
    const [hovered, setHovered] = useState<string | null>(null);

    if (languages.length === 0) return null;

    // Carve a small visible gap (GAP_UNITS) between every two arcs so the
    // segments stay visually distinguishable even when their colors are
    // close (GitHub's official palette has TypeScript #3178c6 and Python
    // #3572A5 as basically-the-same blue).
    const GAP_UNITS = 3;
    const N = languages.length;
    const visibleCircumference = CIRCUMFERENCE - N * GAP_UNITS;

    let cumulativeVisible = 0;
    const segments = languages.map((lang) => {
        const segmentLength = (lang.percentage / 100) * visibleCircumference;
        const dashLength = segmentLength;
        const gapLength = CIRCUMFERENCE - segmentLength;
        const offset = -cumulativeVisible;
        cumulativeVisible += segmentLength + GAP_UNITS;
        return {
            ...lang,
            dashArray: `${dashLength} ${gapLength}`,
            dashOffset: offset,
        };
    });

    const top = segments[0];
    const active = hovered ? segments.find((s) => s.name === hovered) : null;

    return (
        <div className="donut-with-legend">
            <svg
                className="donut-chart"
                width={SIZE}
                height={SIZE}
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                role="img"
                aria-label={`Top languages: ${segments
                    .map((s) => `${s.name} ${s.percentage}%`)
                    .join(", ")}`}
            >
                <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
                    <circle
                        cx={CENTER}
                        cy={CENTER}
                        r={RADIUS}
                        fill="none"
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth={STROKE_WIDTH}
                    />
                    {segments.map((seg) => (
                        <circle
                            key={seg.name}
                            cx={CENTER}
                            cy={CENTER}
                            r={RADIUS}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth={STROKE_WIDTH}
                            strokeDasharray={seg.dashArray}
                            strokeDashoffset={seg.dashOffset}
                            className={
                                hovered && hovered !== seg.name
                                    ? "donut-arc dimmed"
                                    : "donut-arc"
                            }
                            onMouseEnter={() => setHovered(seg.name)}
                            onMouseLeave={() => setHovered(null)}
                            style={{ cursor: "pointer" }}
                        >
                            <title>{`${seg.name}: ${seg.percentage}%`}</title>
                        </circle>
                    ))}
                </g>
                <text
                    x={CENTER}
                    y={CENTER - 2}
                    textAnchor="middle"
                    className="donut-center-name"
                >
                    {active ? active.name : top.name}
                </text>
                <text
                    x={CENTER}
                    y={CENTER + 16}
                    textAnchor="middle"
                    className="donut-center-label"
                >
                    {active ? `${active.percentage}%` : "TOP"}
                </text>
            </svg>
            <div className="donut-legend">
                {languages.map((lang) => (
                    <div
                        key={lang.name}
                        className={
                            hovered && hovered !== lang.name
                                ? "donut-legend-item dimmed"
                                : "donut-legend-item"
                        }
                        onMouseEnter={() => setHovered(lang.name)}
                        onMouseLeave={() => setHovered(null)}
                    >
                        <span
                            className="donut-legend-dot"
                            style={{ backgroundColor: lang.color }}
                        />
                        <span className="donut-legend-name">{lang.name}</span>
                        <span className="donut-legend-pct">
                            {lang.percentage}%
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
