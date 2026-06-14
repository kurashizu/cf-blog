/**
 * chunker — split Markdown content into semantic chunks for embedding.
 *
 * Strategy (both blog and news use the same section-based approach):
 *   1. Split by ## headings
 *   2. If a section > MAX_CHUNK_SIZE, split by ### subheadings
 *   3. If still > MAX_CHUNK_SIZE, split by paragraph (double newline)
 *   4. If still > MAX_CHUNK_SIZE, split by sentence
 *
 * Blog additionally gets an "overview" chunk (title + description + tags).
 */

const MAX_CHUNK_SIZE = 1200;

export interface Chunk {
    /** Text to send to the embedding model (includes title prefix). */
    text: string;
    metadata: ChunkMetadata;
}

export interface ChunkMetadata {
    source: "blog" | "news";
    type: "overview" | "section" | "paragraph";
    id: string;
    title: string;
    heading: string;
    excerpt: string;
    tags: string[];
    url: string;
    by: string;
    published_at: string;
}

export interface IndexableItem {
    source: "blog" | "news";
    id: string;
    title: string;
    content: string;
    description?: string;
    tags?: string[];
    url?: string;
    by?: string;
    published_at: string;
}

/** Generate all chunks for a single indexable item. */
export function chunkItem(item: IndexableItem): Chunk[] {
    const chunks: Chunk[] = [];

    // ── Blog overview chunk ──
    if (item.source === "blog" && item.description) {
        const overviewText = item.tags?.length
            ? `title: ${item.title} | text: ${item.description} | tags: ${item.tags.join(", ")}`
            : `title: ${item.title} | text: ${item.description}`;
        chunks.push({
            text: overviewText,
            metadata: {
                source: "blog",
                type: "overview",
                id: item.id,
                title: item.title,
                heading: "",
                excerpt: item.description.slice(0, 150),
                tags: item.tags ?? [],
                url: "",
                by: "",
                published_at: item.published_at,
            },
        });
    }

    // ── Content section chunks (shared by blog & news) ──
    const sections = splitByHeadings(item.content);
    let sectionIdx = 0;
    for (const section of sections) {
        const sectionText = section.heading
            ? `## ${section.heading}\n${section.body}`
            : section.body;

        const fullText = `title: ${item.title} | text: ${sectionText}`;

        if (sectionText.length <= MAX_CHUNK_SIZE) {
            // Fits as one section chunk
            chunks.push({
                text: fullText,
                metadata: {
                    source: item.source,
                    type: "section",
                    id: item.id,
                    title: item.title,
                    heading: section.heading ?? "",
                    excerpt: section.body
                        .replace(/\n+/g, " ")
                        .trim()
                        .slice(0, 150),
                    tags: item.tags ?? [],
                    url: item.url ?? "",
                    by: item.by ?? "",
                    published_at: item.published_at,
                },
            });
            sectionIdx++;
        } else {
            // Split further
            const subChunks = splitLongSection(sectionText, item);
            for (const sc of subChunks) {
                chunks.push(sc);
            }
        }
    }

    return chunks;
}

interface HeadingSection {
    heading: string | null;
    body: string;
}

/** Split Markdown text by ## headings. The intro (before first ##) is one section. */
function splitByHeadings(content: string): HeadingSection[] {
    // Match ## but not ###
    const lines = content.split("\n");
    const sections: HeadingSection[] = [];
    let currentHeading: string | null = null;
    let currentBody: string[] = [];

    for (const line of lines) {
        const headingMatch = line.match(/^##\s(?!\#)(.+)/);
        if (headingMatch) {
            if (currentBody.length > 0 || currentHeading !== null) {
                sections.push({
                    heading: currentHeading,
                    body: currentBody.join("\n").trim(),
                });
            }
            currentHeading = headingMatch[1].trim();
            currentBody = [];
        } else {
            currentBody.push(line);
        }
    }

    // Last section
    sections.push({
        heading: currentHeading,
        body: currentBody.join("\n").trim(),
    });

    return sections;
}

/** Recursively split a section that exceeds MAX_CHUNK_SIZE. */
function splitLongSection(text: string, item: IndexableItem): Chunk[] {
    const result: Chunk[] = [];

    // Try ### subheadings first
    const subSections = splitBySubheadings(text);
    if (subSections.length > 1) {
        let paraIdx = 0;
        for (const sub of subSections) {
            const fullText = `title: ${item.title} | text: ${sub.text}`;
            if (sub.text.length <= MAX_CHUNK_SIZE) {
                result.push({
                    text: fullText,
                    metadata: {
                        source: item.source,
                        type: "section",
                        id: item.id,
                        title: item.title,
                        heading: sub.heading ?? "",
                        excerpt: sub.text
                            .replace(/\n+/g, " ")
                            .trim()
                            .slice(0, 150),
                        tags: item.tags ?? [],
                        url: item.url ?? "",
                        by: item.by ?? "",
                        published_at: item.published_at,
                    },
                });
                paraIdx++;
            } else {
                // Sub-section still too long, split by paragraphs
                const paras = splitByParagraphs(sub.text, item);
                result.push(...paras);
            }
        }
        return result;
    }

    // No subheadings, split by paragraphs
    const paras = splitByParagraphs(text, item);
    if (paras.length > 0) return paras;

    // Last resort: split by sentences
    return splitBySentences(text, item);
}

/** Split by ### subheadings. */
function splitBySubheadings(
    text: string,
): { heading: string | null; text: string }[] {
    const lines = text.split("\n");
    const result: { heading: string | null; text: string }[] = [];
    let currentHeading: string | null = null;
    let currentBody: string[] = [];

    for (const line of lines) {
        const match = line.match(/^###\s(.+)/);
        if (match) {
            if (currentBody.length > 0 || currentHeading !== null) {
                result.push({
                    heading: currentHeading,
                    text: currentBody.join("\n").trim(),
                });
            }
            currentHeading = match[1].trim();
            currentBody = [];
        } else {
            currentBody.push(line);
        }
    }
    result.push({
        heading: currentHeading,
        text: currentBody.join("\n").trim(),
    });
    return result;
}

/** Group paragraphs into MAX_CHUNK_SIZE buckets. */
function splitByParagraphs(text: string, item: IndexableItem): Chunk[] {
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    if (paragraphs.length <= 1) return [];

    const chunks: Chunk[] = [];
    let buffer: string[] = [];
    let bufferLen = 0;

    for (const para of paragraphs) {
        if (bufferLen + para.length > MAX_CHUNK_SIZE && buffer.length > 0) {
            const chunkText = buffer.join("\n\n");
            chunks.push(makeParagraphChunk(chunkText, item));
            buffer = [];
            bufferLen = 0;
        }
        buffer.push(para);
        bufferLen += para.length;
    }
    if (buffer.length > 0) {
        chunks.push(makeParagraphChunk(buffer.join("\n\n"), item));
    }

    return chunks;
}

/** Split by sentence boundaries. */
function splitBySentences(text: string, item: IndexableItem): Chunk[] {
    const sentences = text.match(/[^.!?\n]+[.!?]+(\s|$)/g) ?? [text];
    if (sentences.length <= 1) {
        // Can't split further, return as-is even if oversized
        return [makeParagraphChunk(text, item)];
    }

    const chunks: Chunk[] = [];
    let buffer: string[] = [];
    let bufferLen = 0;

    for (const s of sentences) {
        if (bufferLen + s.length > MAX_CHUNK_SIZE && buffer.length > 0) {
            chunks.push(makeParagraphChunk(buffer.join(" "), item));
            buffer = [];
            bufferLen = 0;
        }
        buffer.push(s.trim());
        bufferLen += s.length;
    }
    if (buffer.length > 0) {
        chunks.push(makeParagraphChunk(buffer.join(" "), item));
    }

    return chunks;
}

function makeParagraphChunk(text: string, item: IndexableItem): Chunk {
    return {
        text: `title: ${item.title} | text: ${text}`,
        metadata: {
            source: item.source,
            type: "paragraph",
            id: item.id,
            title: item.title,
            heading: "",
            excerpt: text.replace(/\n+/g, " ").trim().slice(0, 150),
            tags: item.tags ?? [],
            url: item.url ?? "",
            by: item.by ?? "",
            published_at: item.published_at,
        },
    };
}

/** Generate the vector ID for a chunk. Max 64 bytes (Vectorize limit). */
export function chunkVectorId(chunk: Chunk): string {
    const m = chunk.metadata;
    const safeId = m.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const raw = `${m.source}-${safeId}-${m.type}`;
    // Truncate to 64 bytes to avoid VECTOR_UPSERT_ERROR (code=40008)
    if (raw.length > 64) {
        return raw.slice(0, 64);
    }
    return raw;
}
