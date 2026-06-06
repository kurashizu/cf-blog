import { type ContributionsCache, buildHeatmap } from "@/lib/contributions";
import { ContributionsHeatmap } from "./ContributionsHeatmap";

interface ContributionsCardProps {
    data: ContributionsCache;
}

function FlameIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className="inline-block align-middle"
        >
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
    );
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
                    <FlameIcon />
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
