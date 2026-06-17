/**
 * Daily HN fetch cron.
 *
 * `wrangler.toml` schedules this at `0 18 * * *` (18:00 UTC, which is 05:00 AEDT).
 * Pulls up to 30 top stories from Hacker News and upserts them into D1.
 * INSERT OR REPLACE on the same id keeps the table free of duplicates;
 * a fresh `fetched_at = datetime('now')` marks today's batch.
 *
 * The homepage reads `WHERE date(fetched_at) = date('now') ORDER BY time
 * DESC LIMIT 5` so only today's top 5 show up there. The /news archive
 * shows the full history regardless of fetch date.
 */
import { fetchHNNews } from "../lib/sources";
import type { Env } from "../types";

const DAILY_HN_COUNT = 30;

export async function handleHNCron(env: Env): Promise<void> {
    const stories = await fetchHNNews(DAILY_HN_COUNT);
    if (stories.length === 0) {
        console.log("HN cron: empty response, skipping");
        return;
    }

    const stmt = env.DB.prepare(`
        INSERT OR REPLACE INTO news_items
            (id, title, url, score, by, time, descendants, domain, summary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                "",
            )
            .run();
    }

    console.log(`HN cron: ${stories.length} stories upserted`);
}
