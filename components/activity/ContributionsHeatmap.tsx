import {
  type HeatmapView,
  HEATMAP_CELL_SIZE,
  HEATMAP_STRIDE,
  HEATMAP_DAY_LABEL_W,
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
        aria-label="GitHub contribution heatmap for the last 90 days"
      >
        {view.monthLabels.map(({ col, label }) => (
          <text
            key={`m-${col}`}
            x={HEATMAP_PADDING_X + HEATMAP_DAY_LABEL_W + col * HEATMAP_STRIDE}
            y={HEATMAP_PADDING_Y + 10}
            className="heat-month-label"
          >
            {label}
          </text>
        ))}

        {view.dayLabels.map(({ row, label }) => (
          <text
            key={`d-${row}`}
            x={HEATMAP_PADDING_X + 4}
            y={
              HEATMAP_PADDING_Y +
              HEATMAP_MONTH_LABEL_H +
              row * HEATMAP_STRIDE +
              HEATMAP_CELL_SIZE / 2 +
              1
            }
            className="heat-day-label"
          >
            {label}
          </text>
        ))}

        {view.cells.map((cell) => {
          const x =
            HEATMAP_PADDING_X + HEATMAP_DAY_LABEL_W + cell.col * HEATMAP_STRIDE;
          const y =
            HEATMAP_PADDING_Y + HEATMAP_MONTH_LABEL_H + cell.row * HEATMAP_STRIDE;
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
