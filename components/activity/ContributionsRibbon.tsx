import { type ContributionsCache, buildHeatmap } from "@/lib/contributions";
import { ContributionsHeatmap } from "./ContributionsHeatmap";

const TARGET_WIDTH = 824;

interface ContributionsRibbonProps {
  data: ContributionsCache;
}

export function ContributionsRibbon({ data }: ContributionsRibbonProps) {
  const view = buildHeatmap(data, TARGET_WIDTH);
  if (view.cols === 0) return null;

  return (
    <div className="contributions-ribbon">
      <ContributionsHeatmap view={view} />
    </div>
  );
}
