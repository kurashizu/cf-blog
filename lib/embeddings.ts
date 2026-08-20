/**
 * embeddings — minimal Gemini Embedding 2 client for the search API.
 *
 * Reuses the same GEMINI_API_KEY as the rest of cf-blog.
 */

const EMBED_TIMEOUT_MS = 15_000;

interface EmbedContentResponse {
    embedding: { values: number[] };
}

/**
 * Embed a search query using Gemini Embedding 2.
 * The query is prefixed with the "search result" task instruction as recommended
 * by the Gemini Embedding 2 docs.
 */
export class EmbeddingQuotaError extends Error {
    constructor(msg = "Search service is currently busy. Please try again later.") {
        super(msg);
        this.name = "EmbeddingQuotaError";
    }
}

export async function embedSearchQuery(
    query: string,
    apiKey: string,
): Promise<number[]> {
    const text = `task: search result | query: ${query}`;

    const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
                model: "models/gemini-embedding-2",
                content: { parts: [{ text }] },
                outputDimensionality: 768,
            }),
            signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
        },
    );

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        const lowerBody = body.toLowerCase();
        if (
            res.status === 429 ||
            lowerBody.includes("429") ||
            lowerBody.includes("quota") ||
            lowerBody.includes("resource_exhausted") ||
            lowerBody.includes("exhausted")
        ) {
            throw new EmbeddingQuotaError();
        }
        throw new Error(`Embedding service unavailable (${res.status})`);
    }

    const json = (await res.json()) as EmbedContentResponse;
    return json.embedding.values;
}
