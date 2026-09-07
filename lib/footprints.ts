import { UAParser } from "ua-parser-js";
import { getDB } from "./d1";

/** Keep the table bounded — cheap at this scale (~5k rows). */
const MAX_ROWS = 5000;

/** Latest N rows returned by GET for the public wall. */
const RECENT_LIMIT = 200;

export interface Footprint {
    id: string;
    country: string;
    timezone: string;
    browser: string;
    os: string;
    colo: string;
    at: string;
}

export interface CountryCount {
    code: string;
    count: number;
}

export interface FootprintSummary {
    total: number;
    countries: CountryCount[];
    recent: Footprint[];
}

/**
 * The subset of `request.cf` this feature is allowed to read. Narrower than
 * `VisitorGeo` in lib/visitor.ts on purpose: no city, region or ASN — those
 * would make a "coarse, anonymous" wall re-identifying.
 */
export interface FootprintEdge {
    /** ISO 3166-1 alpha-2, e.g. "DE". */
    country?: string;
    timezone?: string;
    /** Three-letter Cloudflare colo code, e.g. "SJC". */
    colo?: string;
}

/**
 * Derive the row to store from edge data + a User-Agent string. Returns
 * `null` when there is no edge geo to anchor the stamp to (local dev, or a
 * request that didn't come through Cloudflare) — callers should answer
 * 503 rather than store a blank country.
 *
 * Browser/OS are family names ONLY (e.g. "Chrome", "macOS") — versions are
 * dropped deliberately, this is not a fingerprinting surface.
 */
export function deriveFootprint(
    edge: FootprintEdge | undefined,
    userAgent: string,
): Omit<Footprint, "id" | "at"> | null {
    const country = edge?.country ?? "";
    if (!edge || !country) return null;

    const parser = new UAParser(userAgent);
    const browser = parser.getBrowser().name ?? "";
    const os = parser.getOS().name ?? "";

    return {
        country,
        timezone: edge.timezone ?? "",
        browser,
        os,
        colo: edge.colo ?? "",
    };
}

/** Aggregate rows into `{ code, count }`, sorted by count desc. */
export function summarizeCountries(rows: { country: string }[]): CountryCount[] {
    const counts = new Map<string, number>();
    for (const row of rows) {
        if (!row.country) continue;
        counts.set(row.country, (counts.get(row.country) ?? 0) + 1);
    }
    return Array.from(counts.entries())
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count);
}

function rowToFootprint(row: {
    id: string;
    country: string;
    timezone: string | null;
    browser: string | null;
    os: string | null;
    colo: string | null;
    created_at: string;
}): Footprint {
    return {
        id: row.id,
        country: row.country,
        timezone: row.timezone || "",
        browser: row.browser || "",
        os: row.os || "",
        colo: row.colo || "",
        at: row.created_at,
    };
}

export function createFootprintsRepo() {
    return {
        async getSummary(): Promise<FootprintSummary> {
            const db = getDB();

            const totalRow = await db
                .prepare(`SELECT COUNT(*) AS n FROM footprints`)
                .first<{ n: number }>();
            const total = totalRow?.n ?? 0;

            const countryRows = await db
                .prepare(`SELECT country FROM footprints`)
                .all();
            const countries = summarizeCountries(
                (countryRows.results ?? []) as unknown as { country: string }[],
            );

            const recentResult = await db
                .prepare(
                    `SELECT id, country, timezone, browser, os, colo, created_at
                     FROM footprints
                     ORDER BY created_at DESC
                     LIMIT ?`,
                )
                .bind(RECENT_LIMIT)
                .all();
            const recent = (
                (recentResult.results ?? []) as unknown as {
                    id: string;
                    country: string;
                    timezone: string | null;
                    browser: string | null;
                    os: string | null;
                    colo: string | null;
                    created_at: string;
                }[]
            ).map(rowToFootprint);

            return { total, countries, recent };
        },

        async add(
            data: Omit<Footprint, "id" | "at">,
        ): Promise<Footprint> {
            const db = getDB();
            const footprint: Footprint = {
                id: crypto.randomUUID(),
                country: data.country,
                timezone: data.timezone,
                browser: data.browser,
                os: data.os,
                colo: data.colo,
                at: new Date().toISOString(),
            };

            await db
                .prepare(
                    `INSERT INTO footprints
                     (id, country, timezone, browser, os, colo, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                )
                .bind(
                    footprint.id,
                    footprint.country,
                    footprint.timezone,
                    footprint.browser,
                    footprint.os,
                    footprint.colo,
                    footprint.at,
                )
                .run();

            // Keep the table bounded — cheap DELETE at this scale.
            await db
                .prepare(
                    `DELETE FROM footprints WHERE id NOT IN (
                        SELECT id FROM footprints ORDER BY created_at DESC LIMIT ?
                     )`,
                )
                .bind(MAX_ROWS)
                .run();

            return footprint;
        },
    };
}
