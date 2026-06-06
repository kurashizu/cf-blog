import { r2Get } from "./r2";
import { r2Paths } from "./r2-paths";

export interface ContributionDay {
    date: string; // ISO YYYY-MM-DD
    count: number;
}

export interface ContributionsCache {
    username: string;
    fetchedAt: string; // ISO timestamp
    totalContributions: number;
    days: ContributionDay[];
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatmapCell {
    row: number;
    col: number;
    date: string;
    count: number;
    level: HeatLevel;
}

export interface HeatmapView {
    cells: HeatmapCell[];
    cols: number;
    monthLabels: { col: number; label: string }[];
    dayLabels: { row: number; label: string }[];
    totalLast90: number;
    totalLast365: number;
    streak: number;
    width: number;
    height: number;
}

// Layout constants shared between the cache-side math and the SVG renderer
export const HEATMAP_CELL_SIZE = 12;
export const HEATMAP_CELL_GAP = 2;
export const HEATMAP_STRIDE = HEATMAP_CELL_SIZE + HEATMAP_CELL_GAP; // 17
export const HEATMAP_DAY_LABEL_W = 22;
export const HEATMAP_MONTH_LABEL_H = 16;
export const HEATMAP_PADDING_X = 2;
export const HEATMAP_PADDING_Y = 2;

const MONTH_ABBR = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DISPLAY_DAY_INDICES = [1, 3, 5] as const; // Mon, Wed, Fri

export function getLevel(count: number): HeatLevel {
    if (count <= 0) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    if (count <= 9) return 3;
    return 4;
}

export async function getContributions(): Promise<ContributionsCache | null> {
    try {
        const data = await r2Get(r2Paths.githubContributionsCache);
        return JSON.parse(data) as ContributionsCache;
    } catch {
        return null;
    }
}

export function buildHeatmap(
    cache: ContributionsCache,
    windowDays = 90,
): HeatmapView {
    const sorted = [...cache.days].sort((a, b) => a.date.localeCompare(b.date));
    const slice = sorted.slice(-windowDays);

    if (slice.length === 0) {
        return emptyView();
    }

    const firstDate = new Date(slice[0].date);
    const lastDate = new Date(slice[slice.length - 1].date);
    const padBefore = firstDate.getUTCDay();
    const padAfter = 6 - lastDate.getUTCDay();
    const totalCells = padBefore + slice.length + padAfter;
    const cols = Math.ceil(totalCells / 7);

    const cells: HeatmapCell[] = [];
    for (let i = padBefore; i < padBefore + slice.length; i++) {
        const day = slice[i - padBefore];
        const dow = new Date(day.date).getUTCDay();
        cells.push({
            row: dow,
            col: Math.floor(i / 7),
            date: day.date,
            count: day.count,
            level: getLevel(day.count),
        });
    }

    // Month labels appear at the first non-empty cell of each column whose month
    // changes. Avoids dumping "Mar" on every column.
    const monthLabels: { col: number; label: string }[] = [];
    let prevMonth = -1;
    for (let c = 0; c < cols; c++) {
        const colCells = cells.filter((cell) => cell.col === c);
        if (colCells.length === 0) continue;
        const first = colCells[0];
        const m = new Date(first.date).getUTCMonth();
        if (m !== prevMonth) {
            monthLabels.push({ col: c, label: MONTH_ABBR[m] });
            prevMonth = m;
        }
    }

    const dayLabels = DISPLAY_DAY_INDICES.map((row) => ({
        row,
        label: DAY_LABELS[row],
    }));

    const totalLast90 = slice.reduce((sum, d) => sum + d.count, 0);
    const totalLast365 = cache.days.reduce((sum, d) => sum + d.count, 0);

    // Current streak: walk backwards from the most recent day, stop on first 0
    let streak = 0;
    for (let i = slice.length - 1; i >= 0; i--) {
        if (slice[i].count > 0) streak++;
        else break;
    }

    const width =
        HEATMAP_PADDING_X * 2 +
        HEATMAP_DAY_LABEL_W +
        cols * HEATMAP_STRIDE -
        HEATMAP_CELL_GAP;
    const height =
        HEATMAP_PADDING_Y * 2 +
        HEATMAP_MONTH_LABEL_H +
        7 * HEATMAP_STRIDE -
        HEATMAP_CELL_GAP;

    return {
        cells,
        cols,
        monthLabels,
        dayLabels,
        totalLast90,
        totalLast365,
        streak,
        width,
        height,
    };
}

function emptyView(): HeatmapView {
    return {
        cells: [],
        cols: 0,
        monthLabels: [],
        dayLabels: [],
        totalLast90: 0,
        totalLast365: 0,
        streak: 0,
        width: 0,
        height: 0,
    };
}
