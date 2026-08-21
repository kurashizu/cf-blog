-- D1 database schema for cf-blog
-- Apply with: wrangler d1 execute cf-blog-db --file=database/schema.sql
--
-- All CREATE statements use IF NOT EXISTS so the file is idempotent.
-- DROP statements (one-time migrations) are kept at the bottom.

-- ============================================
-- Blog articles index
-- ============================================
CREATE TABLE IF NOT EXISTS posts (
    id                TEXT PRIMARY KEY,
    slug              TEXT NOT NULL,
    title             TEXT NOT NULL,
    excerpt           TEXT,
    content           TEXT NOT NULL DEFAULT '',
    cover_image       TEXT DEFAULT '',
    category          TEXT DEFAULT '',
    tags              TEXT DEFAULT '[]',
    author            TEXT DEFAULT 'Kurashizu',
    status            TEXT DEFAULT 'published',
    published_at      TEXT,
    content_hash      TEXT,
    search_updated_at TEXT
);

-- ============================================
-- HN news archive
-- ============================================
CREATE TABLE IF NOT EXISTS news_items (
    id                INTEGER PRIMARY KEY,
    title             TEXT NOT NULL,
    url               TEXT,
    score             INTEGER NOT NULL DEFAULT 0,
    by                TEXT NOT NULL DEFAULT 'unknown',
    time              INTEGER NOT NULL,
    descendants       INTEGER NOT NULL DEFAULT 0,
    domain            TEXT,
    summary           TEXT NOT NULL DEFAULT '',
    fetched_at        TEXT NOT NULL DEFAULT (datetime('now')),
    search_updated_at TEXT,
    retry_count       INTEGER NOT NULL DEFAULT 0,
    last_failed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_news_time ON news_items(time DESC);

-- ============================================
-- GitHub repos cache (full list)
-- ============================================
CREATE TABLE IF NOT EXISTS github_repos (
    id                INTEGER PRIMARY KEY,
    name              TEXT NOT NULL,
    full_name         TEXT NOT NULL,
    owner_login       TEXT NOT NULL DEFAULT '',
    description       TEXT,
    html_url          TEXT NOT NULL,
    homepage          TEXT DEFAULT '',
    language          TEXT,
    topics            TEXT DEFAULT '[]',
    languages_json    TEXT DEFAULT '[]',
    stargazers_count  INTEGER DEFAULT 0,
    forks_count       INTEGER DEFAULT 0,
    open_issues_count INTEGER DEFAULT 0,
    fork              INTEGER DEFAULT 0,
    archived          INTEGER DEFAULT 0,
    disabled          INTEGER DEFAULT 0,
    license_spdx_id   TEXT,
    size              INTEGER DEFAULT 0,
    pushed_at         TEXT,
    created_at        TEXT,
    updated_at        TEXT,
    fetched_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_github_repos_stars
    ON github_repos(stargazers_count DESC);
CREATE INDEX IF NOT EXISTS idx_github_repos_language
    ON github_repos(language);
CREATE INDEX IF NOT EXISTS idx_github_repos_fork
    ON github_repos(fork);

-- ============================================
-- Guestbook messages
-- ============================================
CREATE TABLE IF NOT EXISTS guestbook_messages (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    content       TEXT NOT NULL,
    email         TEXT DEFAULT '',
    timestamp     TEXT NOT NULL,
    avatar        TEXT DEFAULT '',
    avatar_index  INTEGER DEFAULT 0,
    approved      INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_guestbook_timestamp
    ON guestbook_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_approved
    ON guestbook_messages(approved);

-- ============================================
-- Generic cache key-value store (replaces R2 bucket for small caches)
-- ============================================
CREATE TABLE IF NOT EXISTS cache_entries (
    key       TEXT PRIMARY KEY,
    value     TEXT NOT NULL,
    fetched_at TEXT NOT NULL
);

-- ============================================
-- Audit log — records every external API call and key operation
-- from the cache-worker (Gemini Embedding, Vectorize upsert, GitHub,
-- HN fetch, etc.). Fire-and-forget writes; failures must never affect
-- the main flow. Auto-pruned to 30 days by the 30-min refresh cron.
--
-- Schema is intentionally narrow: each row = one API call (or one
-- wrapped operation). batchEmbedContents with N chunks still counts
-- as ONE row with request_count=N (so quota usage is easy to sum).
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ts            TEXT NOT NULL DEFAULT (datetime('now')),
    category      TEXT NOT NULL,        -- 'embedding' | 'vectorize' | 'gemini_generate' | 'github' | 'aa' | 'hn' | 'refresh'
    operation     TEXT NOT NULL,        -- 'batch_embed' | 'vector_upsert' | 'summary_rewrite' | 'fetch_top30' | etc.
    target        TEXT DEFAULT '',      -- news id, post slug, cache key, '' for global
    status        TEXT NOT NULL,        -- 'ok' | 'failed' | 'skipped'
    http_status   INTEGER,              -- HTTP status code if applicable
    latency_ms    INTEGER,              -- wall-clock duration of the operation
    request_count INTEGER,              -- batch size (e.g., chunks in batchEmbed)
    input_tokens  INTEGER,              -- Gemini usageMetadata.promptTokenCount
    error_code    TEXT,                 -- 'RESOURCE_EXHAUSTED' etc
    error_message TEXT,                 -- short error message (truncated)
    metadata      TEXT DEFAULT '{}'     -- JSON extras (retry_after_s, model, etc.)
);

CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_category_ts ON audit_log(category, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_status_ts ON audit_log(status, ts DESC);

-- ============================================
-- One-time migrations (already applied to existing DBs)
-- ============================================
-- These are kept here for documentation. Running them again on an
-- already-migrated DB will error with "duplicate column" — that's
-- expected. Use `pragma table_info(news_items)` to verify state.
--
-- ALTER TABLE news_items ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
-- ALTER TABLE news_items ADD COLUMN last_failed_at TEXT;
