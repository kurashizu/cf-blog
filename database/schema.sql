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
-- Generic cache key-value store (replaces R2 bucket for small caches)
-- ============================================
CREATE TABLE IF NOT EXISTS cache_entries (
    key       TEXT PRIMARY KEY,
    value     TEXT NOT NULL,
    fetched_at TEXT NOT NULL
);

-- ============================================
-- About page quick links (managed via D1, rendered on /about)
-- ============================================
CREATE TABLE IF NOT EXISTS about_links (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    url         TEXT NOT NULL,
    icon        TEXT NOT NULL DEFAULT 'link',
    description TEXT NOT NULL DEFAULT '',
    group_name  TEXT NOT NULL DEFAULT 'products',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    visible     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_about_links_visible_sort
    ON about_links(visible, group_name, sort_order);

INSERT OR IGNORE INTO about_links
    (id, name, url, icon, description, group_name, sort_order)
VALUES
    ('share', 'Share', 'https://share.022025.xyz', 'share-2',
     'Temporary file sharing · 5GB max', 'products', 10);
