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
    search_updated_at TEXT
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
-- One-time migrations
-- ============================================
-- 2026-06-15: drop HN fetch dedup log. The HN cron is now daily (max 30
-- stories) and uses INSERT OR REPLACE on the same id, so dedup is no
-- longer needed.
DROP TABLE IF EXISTS news_fetch_log;
