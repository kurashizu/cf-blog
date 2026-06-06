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

export function ContributionsHeatmap({ view }: ContributionsHeatmapProps) {
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
        </div>
    );
}
