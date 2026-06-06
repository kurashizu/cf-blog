import { type ContributionsCache, buildHeatmap } from "@/lib/contributions";
import { ContributionsHeatmap } from "./ContributionsHeatmap";

interface ContributionsCardProps {
  data: ContributionsCache;
}

export function ContributionsCard({ data }: ContributionsCardProps) {
  const view = buildHeatmap(data, 90);
  if (view.cols === 0) return null;

  return (
    <a
      href={`https://github.com/${data.username}`}
      target="_blank"
      rel="noopener noreferrer"
      className="contributions-card"
      aria-label={`View ${data.username}'s GitHub profile`}
    >
      <div className="contributions-header">
        <h2 className="section-title">Coding Activity</h2>
        <span className="contributions-stats">
          <span className="stat-num">{view.totalLast90}</span> commits
          <span className="stat-dot">·</span>
          <span className="stat-num">{view.streak}</span> day streak{" "}
          <span aria-hidden="true">🔥</span>
        </span>
      </div>

      <ContributionsHeatmap view={view} />

      <div className="contributions-footer">
        <span className="heat-legend">
          Less
          <span className="heat-legend-swatch heat-0" />
          <span className="heat-legend-swatch heat-1" />
          <span className="heat-legend-swatch heat-2" />
          <span className="heat-legend-swatch heat-3" />
          <span className="heat-legend-swatch heat-4" />
          More
        </span>
        <span className="view-all-link">View on GitHub →</span>
      </div>
    </a>
  );
}
