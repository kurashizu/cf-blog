-- Blog posts index
CREATE TABLE IF NOT EXISTS posts (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    excerpt         TEXT NOT NULL DEFAULT '',
    content_r2_key  TEXT NOT NULL DEFAULT '',
    cover_image     TEXT NOT NULL DEFAULT '',
    category        TEXT NOT NULL DEFAULT '',
    tags            TEXT NOT NULL DEFAULT '[]',
    status          TEXT NOT NULL DEFAULT 'draft',
    published_at    TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    views           INTEGER DEFAULT 0,
    likes           INTEGER DEFAULT 0
);

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
