import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { getTodayUTC as _getTodayUTC } from "@/shared/date";

/**
 * Merge Tailwind classes with clsx for conditional styling
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Format a date string for display.
 * Returns "" instead of "Invalid Date" when the input is empty or unparseable.
 */
export function formatDate(date: string | Date): string {
    if (!date) return "";
    const d = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

/**
 * Get today's date in UTC as ISO string (YYYY-MM-DD).
 * Re-exported from @/shared/date so existing imports keep working.
 */
export const getTodayUTC = _getTodayUTC;
