/**
 * Daily HN fetch cron.
 *
 * `wrangler.toml` schedules this at `0 18 * * *` (18:00 UTC, which is 05:00 AEDT).
 * Pulls up to 30 top stories from Hacker News and upserts them into D1.
 * The upsert refreshes only the volatile HN fields and a fresh
 * `fetched_at = datetime('now')` to mark today's batch; work already done
 * on the row (the AI summary and its search-index state) is preserved.
 *
 * The homepage reads `WHERE date(fetched_at) = date('now') ORDER BY time
 * DESC LIMIT 5` so only today's top 5 show up there. The /news archive
 * shows the full history regardless of fetch date.
 */
import { fetchHNNews } from "../lib/sources";
import { withAudit } from "../lib/audit";
import type { Env } from "../types";

const DAILY_HN_COUNT = 30;

export async function handleHNCron(env: Env): Promise<void> {
    const stories = await withAudit(
        env,
        "hn",
        "fetch_top30",
        "",
        () => fetchHNNews(DAILY_HN_COUNT),
        { metadata: { source: "cache-worker" } },
    );
    if (stories.length === 0) {
        console.log("HN cron: empty response, skipping");
        return;
    }

    // ON CONFLICT ... DO UPDATE, never INSERT OR REPLACE: replace deletes
    // the existing row, which reset `summary`, `search_updated_at` and
    // `retry_count` to their defaults. Any story that stayed in the top 30
    // across days therefore had its AI summary thrown away and rewritten
    // from scratch every night — burning Gemini quota for no change.
    // Score/comments/title are refreshed; everything earned stays.
    const stmt = env.DB.prepare(`
        INSERT INTO news_items
            (id, title, url, score, by, time, descendants, domain, summary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, '')
        ON CONFLICT(id) DO UPDATE SET
            title       = excluded.title,
            url         = excluded.url,
            score       = excluded.score,
            descendants = excluded.descendants,
            domain      = excluded.domain,
            fetched_at  = datetime('now')
    `);

    for (const story of stories) {
        await stmt
            .bind(
                story.id,
                story.title,
                story.url,
                story.score,
                story.by,
                story.time,
                story.descendants,
                story.domain,
            )
            .run();
    }

    console.log(`HN cron: ${stories.length} stories upserted`);
}
