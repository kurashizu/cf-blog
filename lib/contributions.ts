import { getCacheEntry } from "./d1";

export interface ContributionDay {
    date: string;
    count: number;
}

export interface ContributionsCache {
    username: string;
    fetchedAt: string;
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

export const HEATMAP_CELL_SIZE = 14;
export const HEATMAP_CELL_GAP = 2;
export const HEATMAP_STRIDE = HEATMAP_CELL_SIZE + HEATMAP_CELL_GAP;
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

export function getLevel(count: number): HeatLevel {
    if (count <= 0) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    if (count <= 9) return 3;
    return 4;
}

export async function getContributions(): Promise<ContributionsCache | null> {
    return getCacheEntry<ContributionsCache>("github-contributions");
}

/**
 * Build a single-row ribbon heatmap that fills `targetWidth` pixels.
 * The number of days is derived from the available width and the cell
 * stride — "however many days the screen can show".
 */
export function buildHeatmap(
    cache: ContributionsCache,
    targetWidth: number,
    cellSize: number = HEATMAP_CELL_SIZE,
    cellGap: number = HEATMAP_CELL_GAP,
): HeatmapView {
    const sorted = [...cache.days].sort((a, b) => a.date.localeCompare(b.date));

    if (sorted.length === 0) {
        return emptyView();
    }

    const stride = cellSize + cellGap;
    const availableWidth = targetWidth - HEATMAP_PADDING_X * 2;
    const days = Math.max(1, Math.floor(availableWidth / stride));

    const slice = sorted.slice(-days);

    const cells: HeatmapCell[] = slice.map((day, i) => ({
        row: 0,
        col: i,
        date: day.date,
        count: day.count,
        level: getLevel(day.count),
    }));

    const monthLabels: { col: number; label: string }[] = [];
    let prevMonth = -1;
    for (const cell of cells) {
        const m = new Date(cell.date).getUTCMonth();
        if (m !== prevMonth) {
            monthLabels.push({ col: cell.col, label: MONTH_ABBR[m] });
            prevMonth = m;
        }
    }

    const dayLabels: { row: number; label: string }[] = [];

    const totalLast90 = slice.reduce((sum, d) => sum + d.count, 0);
    const totalLast365 = cache.days.reduce((sum, d) => sum + d.count, 0);

    let streak = 0;
    for (let i = slice.length - 1; i >= 0; i--) {
        if (slice[i].count > 0) streak++;
        else break;
    }

    const width = HEATMAP_PADDING_X * 2 + cells.length * stride - cellGap;
    const height =
        HEATMAP_PADDING_Y * 2 + HEATMAP_MONTH_LABEL_H + stride - cellGap;

    return {
        cells,
        cols: cells.length,
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
