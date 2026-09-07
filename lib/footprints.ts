import { UAParser } from "ua-parser-js";
import { getDB } from "./d1";

/** Keep the table bounded — cheap at this scale (~5k rows). */
const MAX_ROWS = 5000;

/** Latest N rows returned by GET for the public wall. */
const RECENT_LIMIT = 200;

/** How often GET may kick the access-log import (see importFromAccessLog). */
const IMPORT_INTERVAL_MS = 10 * 60 * 1000;
const IMPORT_STATE_KEY = "footprints:import";

/**
 * Where a row came from: an explicit `[ leave a footprint ]` click on the
 * landing site, or an anonymised blog.krsz.in visit lifted from the inbound
 * access log (the `/api/visitor-info` call the blog's home page makes).
 */
export type FootprintSource = "stamp" | "blog";

export interface Footprint {
    id: string;
    country: string;
    timezone: string;
    browser: string;
    os: string;
    colo: string;
    at: string;
    source: FootprintSource;
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

/** Browser/OS family names ONLY — versions are dropped deliberately. */
function uaFamilies(userAgent: string): { browser: string; os: string } {
    const parser = new UAParser(userAgent);
    return {
        browser: parser.getBrowser().name ?? "",
        os: parser.getOS().name ?? "",
    };
}

/**
 * Derive the row to store from edge data + a User-Agent string. Returns
 * `null` when there is no edge geo to anchor the stamp to (local dev, or a
 * request that didn't come through Cloudflare) — callers should answer
 * 503 rather than store a blank country.
 */
export function deriveFootprint(
    edge: FootprintEdge | undefined,
    userAgent: string,
): Omit<Footprint, "id" | "at" | "source"> | null {
    const country = edge?.country ?? "";
    if (!edge || !country) return null;

    return {
        country,
        timezone: edge.timezone ?? "",
        ...uaFamilies(userAgent),
        colo: edge.colo ?? "",
    };
}

/**
 * One (ip, day) group from api_access_log, as selected by
 * `ACCESS_LOG_GROUPS_SQL`: the first visitor-info call that IP made that day.
 * `id` is that first row's id — stable forever, since the log only ever
 * appends — so it doubles as the dedupe key across import runs.
 */
export interface AccessLogGroup {
    id: number;
    country: string | null;
    user_agent: string | null;
    /** SQLite datetime, "YYYY-MM-DD HH:MM:SS" (UTC). */
    ts: string;
}

/**
 * Map an access-log group to a footprint row, or `null` when it is not
 * worth showing: no country, or a UA that no browser family can be read
 * from (curl, monitors, scrapers). The log has no timezone or colo for the
 * caller, so those stay empty and the wall simply omits them.
 */
export function deriveFromAccessLog(
    group: AccessLogGroup,
): Omit<Footprint, "id"> & { sourceRef: string } | null {
    const country = group.country ?? "";
    if (!country) return null;
    const fam = uaFamilies(group.user_agent ?? "");
    if (!fam.browser) return null;
    return {
        country,
        timezone: "",
        browser: fam.browser,
        os: fam.os,
        colo: "",
        at: sqliteToIso(group.ts),
        source: "blog",
        sourceRef: `blog:${group.id}`,
    };
}

/** "2026-09-07 06:43:19" -> "2026-09-07T06:43:19.000Z"; ISO input passes through. */
export function sqliteToIso(ts: string): string {
    const d = new Date(ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
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

/**
 * One row per (ip, calendar day) among successful visitor-info calls in the
 * log's 30-day window. Grouping happens in SQL so the IP never leaves D1:
 * only the group's first row id, country, UA and time come back.
 */
const ACCESS_LOG_GROUPS_SQL = `
    SELECT MIN(id) AS id, country, user_agent, MIN(ts) AS ts
    FROM api_access_log
    WHERE worker = 'cf-blog'
      AND route = '/api/visitor-info'
      AND outcome = 'ok'
      AND ip IS NOT NULL AND ip != ''
      AND country IS NOT NULL AND country != ''
    GROUP BY ip, date(ts)
    ORDER BY id DESC
    LIMIT 2000`;

interface FootprintRow {
    id: string;
    country: string;
    timezone: string | null;
    browser: string | null;
    os: string | null;
    colo: string | null;
    created_at: string;
    source: string | null;
}

function rowToFootprint(row: FootprintRow): Footprint {
    return {
        id: row.id,
        country: row.country,
        timezone: row.timezone || "",
        browser: row.browser || "",
        os: row.os || "",
        colo: row.colo || "",
        at: row.created_at,
        source: row.source === "blog" ? "blog" : "stamp",
    };
}

/** Per-isolate memo so ensureSchema costs one PRAGMA per cold start, not per request. */
let schemaReady = false;

export function createFootprintsRepo() {
    const db = () => getDB();

    async function prune(): Promise<void> {
        await db()
            .prepare(
                `DELETE FROM footprints WHERE id NOT IN (
                    SELECT id FROM footprints ORDER BY created_at DESC LIMIT ?
                 )`,
            )
            .bind(MAX_ROWS)
            .run();
    }

    /**
     * Self-migration for the production table, which predates the
     * source/source_ref columns. CI applies schema.sql with CREATE TABLE IF
     * NOT EXISTS (a no-op on an existing table) and cannot carry an ALTER
     * that errors on re-run, so the columns and the unique dedupe index are
     * added here, once, the first time the import runs after deploy.
     */
    async function ensureSchema(): Promise<void> {
        if (schemaReady) return;
        const info = await db().prepare(`PRAGMA table_info(footprints)`).all();
        const cols = new Set(
            ((info.results ?? []) as unknown as { name: string }[]).map((r) => r.name),
        );
        if (!cols.has("source")) {
            await db()
                .prepare(`ALTER TABLE footprints ADD COLUMN source TEXT NOT NULL DEFAULT 'stamp'`)
                .run();
        }
        if (!cols.has("source_ref")) {
            await db().prepare(`ALTER TABLE footprints ADD COLUMN source_ref TEXT`).run();
        }
        await db()
            .prepare(
                `CREATE UNIQUE INDEX IF NOT EXISTS idx_footprints_source_ref
                 ON footprints(source_ref) WHERE source_ref IS NOT NULL`,
            )
            .run();
        schemaReady = true;
    }

    return {
        async getSummary(): Promise<FootprintSummary> {
            await ensureSchema();
            const totalRow = await db()
                .prepare(`SELECT COUNT(*) AS n FROM footprints`)
                .first<{ n: number }>();
            const total = totalRow?.n ?? 0;

            const countryRows = await db()
                .prepare(`SELECT country FROM footprints`)
                .all();
            const countries = summarizeCountries(
                (countryRows.results ?? []) as unknown as { country: string }[],
            );

            const recentResult = await db()
                .prepare(
                    `SELECT id, country, timezone, browser, os, colo, created_at, source
                     FROM footprints
                     ORDER BY created_at DESC
                     LIMIT ?`,
                )
                .bind(RECENT_LIMIT)
                .all();
            const recent = (
                (recentResult.results ?? []) as unknown as FootprintRow[]
            ).map(rowToFootprint);

            return { total, countries, recent };
        },

        async add(
            data: Omit<Footprint, "id" | "at" | "source">,
        ): Promise<Footprint> {
            await ensureSchema();
            const footprint: Footprint = {
                id: crypto.randomUUID(),
                country: data.country,
                timezone: data.timezone,
                browser: data.browser,
                os: data.os,
                colo: data.colo,
                at: new Date().toISOString(),
                source: "stamp",
            };

            await db()
                .prepare(
                    `INSERT INTO footprints
                     (id, country, timezone, browser, os, colo, created_at, source, source_ref)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'stamp', NULL)`,
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

            await prune();
            return footprint;
        },

        /**
         * Lift blog.krsz.in visits out of api_access_log into the wall.
         * Idempotent: every run re-scans the whole 30-day window and relies
         * on the unique `source_ref` (`blog:<first row id of that ip+day>`)
         * to skip what is already there, so there is no watermark to get
         * wrong when a visitor returns later the same day. Throttled through
         * cache_entries so a busy guestbook tab does not run it on every GET.
         * Returns the number of rows inserted, or -1 when skipped.
         */
        async importFromAccessLog(force = false): Promise<number> {
            const d = db();
            if (!force) {
                const state = await d
                    .prepare(`SELECT value FROM cache_entries WHERE key = ?`)
                    .bind(IMPORT_STATE_KEY)
                    .first<{ value: string }>();
                if (state) {
                    try {
                        const last = Number(JSON.parse(state.value).lastRun);
                        if (Date.now() - last < IMPORT_INTERVAL_MS) return -1;
                    } catch {
                        /* unreadable state — run the import */
                    }
                }
            }
            // Claim the slot first so two concurrent GETs do not both scan.
            await d
                .prepare(
                    `INSERT INTO cache_entries (key, value, fetched_at) VALUES (?, ?, ?)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`,
                )
                .bind(
                    IMPORT_STATE_KEY,
                    JSON.stringify({ lastRun: Date.now() }),
                    new Date().toISOString(),
                )
                .run();

            await ensureSchema();
            const groups = await d.prepare(ACCESS_LOG_GROUPS_SQL).all();
            const rows = (groups.results ?? []) as unknown as AccessLogGroup[];
            const stmt = d.prepare(
                `INSERT OR IGNORE INTO footprints
                 (id, country, timezone, browser, os, colo, created_at, source, source_ref)
                 VALUES (?, ?, '', ?, ?, '', ?, 'blog', ?)`,
            );
            let inserted = 0;
            const batch: D1PreparedStatement[] = [];
            for (const g of rows) {
                const fp = deriveFromAccessLog(g);
                if (!fp) continue;
                batch.push(
                    stmt.bind(
                        crypto.randomUUID(),
                        fp.country,
                        fp.browser,
                        fp.os,
                        fp.at,
                        fp.sourceRef,
                    ),
                );
            }
            // D1 batches are transactional and far cheaper than N round trips.
            for (let i = 0; i < batch.length; i += 100) {
                const results = await d.batch(batch.slice(i, i + 100));
                for (const r of results) inserted += r.meta?.changes ?? 0;
            }
            if (inserted > 0) await prune();
            return inserted;
        },
    };
}
