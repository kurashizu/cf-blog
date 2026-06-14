-- D1 database schema for cf-blog
-- Apply with: wrangler d1 execute cf-blog-db --file=database/schema.sql

-- ============================================
-- Blog articles index
-- ============================================
CREATE TABLE IF NOT EXISTS posts (
    id                TEXT PRIMARY KEY,
    slug              TEXT NOT NULL,
    title             TEXT NOT NULL,
    excerpt           TEXT,
    content_r2_key    TEXT,
    cover_image       TEXT DEFAULT '',
    category          TEXT DEFAULT '',
    tags              TEXT DEFAULT '[]',
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
    score             INTEGER DEFAULT 0,
    by                TEXT DEFAULT '',
    time              INTEGER DEFAULT 0,
    descendants       INTEGER DEFAULT 0,
    domain            TEXT,
    summary           TEXT DEFAULT '',
    search_updated_at TEXT
);

-- ============================================
-- HN fetch dedup log (prevents cron duplicates)
-- ============================================
CREATE TABLE IF NOT EXISTS news_fetch_log (
    date  TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0
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
