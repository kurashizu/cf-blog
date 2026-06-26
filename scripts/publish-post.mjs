/**
 * Publish a blog post to D1 from a markdown file with YAML frontmatter.
 *
 * Usage:
 *   node scripts/publish-post.mjs docs/drafts/your-post.md
 *
 * The script:
 *   1. Reads the markdown file
 *   2. Parses the YAML frontmatter
 *   3. Extracts the body content
 *   4. Generates an INSERT SQL statement (matching lib/articles.ts save() logic)
 *   5. Executes it via `npx wrangler d1 execute --file`
 */

import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";
import matter from "gray-matter";

// --------------- helpers ---------------

function die(msg) {
    console.error(`\n❌ ${msg}`);
    process.exit(1);
}

function normaliseDate(v) {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "string") return v;
    return "";
}

function normaliseBool(v, defaultVal) {
    if (v === undefined || v === null) return defaultVal;
    if (v === true || v === false) return v;
    if (v === "true") return true;
    if (v === "false") return false;
    return defaultVal;
}

function escapeSql(val) {
    if (val === null || val === undefined) return "NULL";
    // Double single quotes for SQL string escaping
    const s = String(val).replace(/'/g, "''");
    return `'${s}'`;
}

// --------------- main ---------------

const filePath = process.argv[2];
if (!filePath) {
    die("Usage: node scripts/publish-post.mjs <path-to-markdown-file>");
}

// Read and parse the markdown file
let raw;
try {
    raw = readFileSync(filePath, "utf-8");
} catch (err) {
    die(`Cannot read file: ${filePath}\n${err.message}`);
}

const { data, content } = matter(raw);

// Validate required fields
if (!data.title) die("Missing required frontmatter field: title");
if (!data.slug) die("Missing required frontmatter field: slug");

const slug = data.slug;
const title = data.title;
const excerpt = data.description || data.excerpt || "";
const body = content || "";
const coverImage = data.coverImage || data.cover_image || "";
const category = data.category || "";
const tags = Array.isArray(data.tags)
    ? JSON.stringify(data.tags.filter((t) => typeof t === "string"))
    : typeof data.tags === "string"
      ? JSON.stringify(
            data.tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
        )
      : "[]";
const author = data.author || "Kurashizu";
const status = normaliseBool(data.draft, false) ? "draft" : "published";
const publishedAt = normaliseDate(data.date) || null;

// Compute content hash (matching lib/articles.ts logic)
const bodyPreview = body.slice(0, 500);
const encoder = new TextEncoder();
const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${title}|${excerpt}|${bodyPreview}`),
);
const hashArray = Array.from(new Uint8Array(hashBuffer));
const contentHash = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

// Build the SQL
const sql = `
INSERT INTO posts
    (id, slug, title, excerpt, content,
     cover_image, category, tags, author, status, published_at,
     content_hash, search_updated_at)
VALUES (
    ${escapeSql(slug)},
    ${escapeSql(slug)},
    ${escapeSql(title)},
    ${escapeSql(excerpt)},
    ${escapeSql(body)},
    ${escapeSql(coverImage)},
    ${escapeSql(category)},
    ${escapeSql(tags)},
    ${escapeSql(author)},
    ${escapeSql(status)},
    ${escapeSql(publishedAt)},
    ${escapeSql(contentHash)},
    NULL
)
ON CONFLICT(id) DO UPDATE SET
    slug = excluded.slug,
    title = excluded.title,
    excerpt = excluded.excerpt,
    content = excluded.content,
    cover_image = excluded.cover_image,
    category = excluded.category,
    tags = excluded.tags,
    author = excluded.author,
    status = excluded.status,
    published_at = excluded.published_at,
    content_hash = excluded.content_hash,
    search_updated_at = CASE
        WHEN posts.content_hash IS NULL THEN NULL
        WHEN posts.content_hash != excluded.content_hash THEN NULL
        ELSE posts.search_updated_at
    END;
`;

console.log(`\n📝 Publishing: ${title}`);
console.log(`   Slug:       ${slug}`);
console.log(`   Status:     ${status}`);
console.log(`   Tags:       ${tags}`);
console.log(`   Body size:  ${body.length} chars`);
console.log(`   Content hash: ${contentHash}\n`);

// Write SQL to a temp file (avoids shell escaping issues with large content)
const tmpFile = `/tmp/publish-${slug}.sql`;
writeFileSync(tmpFile, sql, "utf-8");

try {
    const output = execSync(
        `npx wrangler d1 execute cf-blog-db --file="${tmpFile}" --remote 2>&1`,
        {
            encoding: "utf-8",
            stdio: "pipe",
        },
    );
    console.log("✅ Published successfully!");
    console.log(output.trim());
} catch (err) {
    console.error("❌ Failed to publish:");
    console.error(err.stderr || err.message || String(err));
    process.exit(1);
} finally {
    try {
        unlinkSync(tmpFile);
    } catch {
        // ignore cleanup errors
    }
}
