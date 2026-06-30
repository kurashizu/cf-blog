/**
 * Publish a blog post to D1 from a markdown file with YAML frontmatter.
 *
 * Usage:
 *   node scripts/publish-post.mjs docs/drafts/your-post.md
 *
 * Zero external dependencies — parses frontmatter manually.
 * The script:
 *   1. Reads the markdown file, parses YAML frontmatter
 *   2. Generates an INSERT SQL statement (matching lib/articles.ts save() logic)
 *   3. Executes it via `npx wrangler d1 execute --file`
 */

import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";

// --------------- YAML frontmatter parser (no deps) ---------------

/**
 * Split markdown on `---` fence and extract frontmatter + body.
 * Returns { data: Record<string, unknown>, content: string }.
 */
function parseFrontmatter(raw) {
    const lines = raw.split(/\r?\n/);
    if (lines[0]?.trim() !== "---") {
        return { data: {}, content: raw };
    }

    const endIdx = lines.indexOf("---", 1);
    if (endIdx === -1) {
        return { data: {}, content: raw };
    }

    const fmLines = lines.slice(1, endIdx);
    const body = lines
        .slice(endIdx + 1)
        .join("\n")
        .trimStart();

    return { data: parseYaml(fmLines), content: body };
}

/**
 * Minimal YAML key-value parser.
 * Handles: scalar strings, numbers, booleans, inline arrays [...], null.
 * Ignores lines starting with `#` (not inside quotes).
 */
function parseYaml(lines) {
    const data = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const colonIdx = trimmed.indexOf(":");
        if (colonIdx === -1) continue;

        const key = trimmed.slice(0, colonIdx).trim();
        let val = trimmed.slice(colonIdx + 1).trim();

        if (!key) continue;

        data[key] = coerceYamlValue(val);
    }
    return data;
}

function coerceYamlValue(raw) {
    if (!raw || raw === "~" || raw === "null") return null;

    // Inline array: [a, b, c]
    if (raw.startsWith("[") && raw.endsWith("]")) {
        const inner = raw.slice(1, -1).trim();
        if (!inner) return [];
        return inner.split(",").map((s) => {
            const v = s.trim();
            // Strip surrounding quotes
            if (
                (v.startsWith('"') && v.endsWith('"')) ||
                (v.startsWith("'") && v.endsWith("'"))
            ) {
                return v.slice(1, -1);
            }
            return v;
        });
    }

    // Strip surrounding quotes
    if (
        (raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'"))
    ) {
        return raw.slice(1, -1);
    }

    // Booleans
    if (raw === "true") return true;
    if (raw === "false") return false;

    // Numbers
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
        return raw.includes(".") ? parseFloat(raw) : parseInt(raw, 10);
    }

    return raw;
}

// --------------- SQL helpers ---------------

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
    const s = String(val).replace(/'/g, "''");
    return `'${s}'`;
}

// --------------- main ---------------

const filePath = process.argv[2];
if (!filePath) {
    die("Usage: node scripts/publish-post.mjs <path-to-markdown-file>");
}

let raw;
try {
    raw = readFileSync(filePath, "utf-8");
} catch (err) {
    die(`Cannot read file: ${filePath}\n${err.message}`);
}

const { data, content } = parseFrontmatter(raw);

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

// Build the SQL (matches lib/articles.ts save() exactly)
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

// Write to temp SQL file to avoid shell escaping issues
const tmpFile = `/tmp/publish-${slug}.sql`;
writeFileSync(tmpFile, sql, "utf-8");

try {
    const output = execSync(
        `npx wrangler d1 execute cf-blog-db --file="${tmpFile}" --remote 2>&1`,
        { encoding: "utf-8", stdio: "pipe", timeout: 60000 },
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
        // ignore
    }
}
