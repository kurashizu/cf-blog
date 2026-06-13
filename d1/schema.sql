-- HN news archive (with AI summaries)
CREATE TABLE IF NOT EXISTS news_items (
    id          INTEGER PRIMARY KEY,
    title       TEXT NOT NULL,
    url         TEXT,
    score       INTEGER NOT NULL DEFAULT 0,
    by          TEXT NOT NULL DEFAULT 'unknown',
    time        INTEGER NOT NULL,
    descendants INTEGER NOT NULL DEFAULT 0,
    domain      TEXT,
    summary     TEXT NOT NULL DEFAULT '',
    fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_news_time ON news_items(time DESC);

-- Track which days have been fetched to prevent duplicates on 30-min cron
CREATE TABLE IF NOT EXISTS news_fetch_log (
    date        TEXT PRIMARY KEY,
    count       INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
