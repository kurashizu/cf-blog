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
    external_url      TEXT DEFAULT '',
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
    -- Search-INDEX retry budget (written by handlers/search-index.ts only).
    retry_count       INTEGER NOT NULL DEFAULT 0,
    last_failed_at    TEXT,
    -- AI-REWRITE retry budget (written by lib/heartbeat.ts only). Kept
    -- separate from retry_count on purpose: the two pipelines run at
    -- different times, and sharing one counter would let a rewrite failure
    -- permanently disqualify the item from ever being indexed afterwards.
    rewrite_retry_count INTEGER NOT NULL DEFAULT 0,
    rewrite_failed_at   TEXT,
    rewrite_error       TEXT
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
-- HN fetch, etc.) and from cf-blog's /api/search. Fire-and-forget
-- writes; failures must never affect the main flow. Auto-pruned to
-- 30 days by the 30-min refresh cron.
--
-- Schema is intentionally narrow: each row = one API call (or one
-- wrapped operation). batchEmbedContents with N chunks still counts
-- as ONE row with request_count=N (so quota usage is easy to sum).
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ts            TEXT NOT NULL DEFAULT (datetime('now')),
    category      TEXT NOT NULL,        -- 'embedding' | 'vectorize' | 'gemini_generate' | 'github' | 'aa' | 'hn' | 'refresh'
    operation     TEXT NOT NULL,        -- 'batch_embed' | 'vector_upsert' | 'summary_rewrite' | 'search_query' | etc.
    target        TEXT DEFAULT '',      -- news id, post slug, query text, cache key, '' for global
    status        TEXT NOT NULL,        -- 'ok' | 'failed' | 'skipped'
    http_status   INTEGER,              -- HTTP status code if applicable
    latency_ms    INTEGER,              -- wall-clock duration of the operation
    request_count INTEGER,              -- batch size (e.g., chunks in batchEmbed); 1 for single-text
    input_tokens  INTEGER,              -- Gemini usageMetadata.promptTokenCount
    error_code    TEXT,                 -- 'RESOURCE_EXHAUSTED' / '429' etc
    error_message TEXT,                 -- short error message (truncated)
    metadata      TEXT DEFAULT '{}'     -- JSON extras (retry_after_s, model, source worker, etc.)
);

CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_category_ts ON audit_log(category, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_status_ts ON audit_log(status, ts DESC);

-- ============================================
-- api_access_log — INBOUND request audit (who called us)
-- ============================================
-- Counterpart to audit_log: that table records OUTBOUND calls we make to
-- upstream APIs (quota/reliability); this one records INBOUND API requests
-- and the caller's identity, so an expensive Gemini/Brave call can be
-- traced back to the IP that triggered it.
--
-- Written by cf-blog and cf-agent route handlers via `shared/api-audit.ts`.
-- Writes are fire-and-forget (ctx.waitUntil) and must never break a
-- response. Auto-pruned to 30 days by the 30-min refresh cron — `ip` is
-- personal data, so the retention window is the privacy control.
--
-- One row per inbound API request. For model-calling routes the row also
-- carries the model and token usage, so "which IP burned the quota" is a
-- single-table query with no join.
CREATE TABLE IF NOT EXISTS api_access_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ts            TEXT NOT NULL DEFAULT (datetime('now')),
    worker        TEXT NOT NULL,        -- 'cf-blog' | 'cf-agent'
    route         TEXT NOT NULL,        -- '/api/llm' | '/api/chat' | '/api/tool' | etc.
    method        TEXT NOT NULL,        -- 'GET' | 'POST' | ...
    outcome       TEXT NOT NULL,        -- 'ok' | 'rate_limited' | 'unauthorized' | 'bad_request' | 'error'
    http_status   INTEGER,              -- status code returned to the caller
    latency_ms    INTEGER,              -- wall-clock handler duration
    ip            TEXT,                 -- CF-Connecting-IP (personal data — pruned at 30 days)
    country       TEXT,                 -- request.cf.country (ISO alpha-2)
    city          TEXT,                 -- request.cf.city
    asn           INTEGER,              -- request.cf.asn
    as_org        TEXT,                 -- request.cf.asOrganization (ISP / hosting provider)
    user_agent    TEXT,                 -- truncated User-Agent
    referer       TEXT,                 -- truncated Referer
    ray_id        TEXT,                 -- CF-Ray, to correlate with Cloudflare logs
    model         TEXT,                 -- model used, for model-calling routes
    input_tokens  INTEGER,              -- prompt tokens attributed to this caller
    output_tokens INTEGER,              -- completion tokens attributed to this caller
    request_count INTEGER,              -- upstream calls made while serving this request
    error_code    TEXT,
    error_message TEXT,                 -- short error message (truncated)
    metadata      TEXT DEFAULT '{}'     -- JSON extras (tool name, query length, stream, etc.)
);

CREATE INDEX IF NOT EXISTS idx_api_access_log_ts ON api_access_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_api_access_log_ip_ts ON api_access_log(ip, ts DESC);
CREATE INDEX IF NOT EXISTS idx_api_access_log_route_ts ON api_access_log(route, ts DESC);
CREATE INDEX IF NOT EXISTS idx_api_access_log_outcome_ts ON api_access_log(outcome, ts DESC);

-- ============================================
-- One-time migrations (already applied to existing DBs)
-- ============================================
-- These are kept here for documentation. Running them again on an
-- already-migrated DB will error with "duplicate column" — that's
-- expected. Use `pragma table_info(news_items)` to verify state.
--
-- ALTER TABLE news_items ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
-- ALTER TABLE news_items ADD COLUMN last_failed_at TEXT;
--
-- ALTER TABLE news_items ADD COLUMN rewrite_retry_count INTEGER NOT NULL DEFAULT 0;
-- ALTER TABLE news_items ADD COLUMN rewrite_failed_at TEXT;
-- ALTER TABLE news_items ADD COLUMN rewrite_error TEXT;
--
-- ALTER TABLE posts ADD COLUMN external_url TEXT DEFAULT '';

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
    ('share', 'Share', 'https://share.krsz.in', 'share-2',
     'Temporary file sharing · 5GB max', 'quick-links', 10);

-- NOTE: `INSERT OR IGNORE` only seeds the row on first apply — subsequent
-- migrations DO NOT update the URL of an existing row. To re-point an
-- existing row to a new apex domain, run an explicit UPDATE against the
-- remote D1:
--
--   npx wrangler d1 execute cf-blog-db --remote --command \
--     "UPDATE about_links SET url = 'https://share.<NEW_APEX>' WHERE id = 'share'"
--
-- Keep the URL above in sync with `SHARE_URL` in `shared/site-config.ts`.

-- ============================================
-- Idempotent migrations for about_links
-- Re-running schema.sql on an existing DB should converge on the same state.
-- ============================================

-- Migration: rename seed group from legacy 'products' to 'quick-links'.
-- The 'share' row was originally seeded with group_name='products'; rename it
-- so it lands in the Quick Links section on /about. Safe to re-run.
UPDATE about_links
SET group_name = 'quick-links'
WHERE id = 'share'
  AND group_name = 'products';

-- Migration: seed the first Friends entry. INSERT OR IGNORE so re-running
-- the schema doesn't clobber an existing row.
INSERT OR IGNORE INTO about_links
    (id, name, url, icon, description, group_name, sort_order)
VALUES
    ('2xnz', '二叉树树', 'https://2x.nz', 'globe',
     'IT/互联网技术分享与实践', 'friends', 10);

-- Migration: seed Quick Links rows added after the initial 'share' seed.
-- INSERT OR IGNORE so existing rows are preserved.
INSERT OR IGNORE INTO about_links
    (id, name, url, icon, description, group_name, sort_order)
VALUES
    ('router', 'Router', 'https://router.krsz.in', 'tv',
     'Edge router & reverse proxy dashboard', 'quick-links', 20),
    ('skill',  'Skill',  'https://skill.krsz.in',  'code',
     'Skills & tools registry', 'quick-links', 30),
    ('mail',   'Mail',   'https://mail.krsz.in',   'mail',
     'Webmail', 'quick-links', 40);

-- Migration: seed the sharetube quick link. INSERT OR IGNORE so re-running
-- the schema doesn't clobber an existing row.
INSERT OR IGNORE INTO about_links
    (id, name, url, icon, description, group_name, sort_order)
VALUES
    ('sharetube', 'ShareTube', 'https://sharetube.krsz.in', 'film',
     'Paste a video URL to download, transcode & share', 'quick-links', 50);
