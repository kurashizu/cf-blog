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
    likes           INTEGER DEFAULT 0,
    -- Search indexing (added 2026-06-14)
    content_hash        TEXT,   -- SHA-256 of title+excerpt+body preview; NULL before first check
    search_updated_at   TEXT    -- NULL = dirty (needs re-index), set by search-index handler on completion
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
    fetched_at  TEXT NOT NULL DEFAULT (datetime('now')),
    -- Search indexing (added 2026-06-14)
    search_updated_at   TEXT   -- NULL = dirty (needs re-index), set by search-index handler on completion
);

CREATE INDEX IF NOT EXISTS idx_news_time ON news_items(time DESC);

-- Track which days have been fetched to prevent duplicates on 30-min cron
CREATE TABLE IF NOT EXISTS news_fetch_log (
    date        TEXT PRIMARY KEY,
    count       INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Track stale vector IDs for search index cleanup
-- cache/search-vectors.json in R2 holds the full vector ID list; this SQL schema
-- documents the expected shape:
--   JSON array of strings: ["blog-{slug}-overview", "blog-{slug}-section", ...]
-- Written by: 30-min refresh (detects changed content → marks dirty)
-- Read by:    3-min search-index handler (upserts vectors, cleans up stale ones)
