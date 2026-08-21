/**
 * Browser-derived timezone + UTC offset, e.g. "SHANGHAI · UTC+8".
 * Handles half/quarter-hour zones (India UTC+5:30, Nepal UTC+5:45, etc.)
 * and DST via Date#getTimezoneOffset.
 */
export function getLocalTimezone(): { city: string; offset: string } {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const city = tz
            .split("/")
            .pop()!
            .replace(/_/g, " ")
            .toUpperCase();
        const offsetMin = -new Date().getTimezoneOffset();
        const sign = offsetMin >= 0 ? "+" : "-";
        const abs = Math.abs(offsetMin);
        const h = Math.floor(abs / 60);
        const m = abs % 60;
        const offsetStr =
            m === 0
                ? `UTC${sign}${h}`
                : `UTC${sign}${h}:${String(m).padStart(2, "0")}`;
        return { city, offset: offsetStr };
    } catch {
        return { city: "UTC", offset: "UTC+0" };
    }
}

/** Current calendar year, from the browser. */
export function getCurrentYear(): number {
    return new Date().getFullYear();
}
