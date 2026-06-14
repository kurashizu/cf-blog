/**
 * embeddings — minimal Gemini Embedding 2 client for the search API.
 *
 * Reuses the same GEMINI_API_KEY as the rest of cf-blog.
 */

interface EmbedContentResponse {
    embedding: { values: number[] };
}

/**
 * Embed a search query using Gemini Embedding 2.
 * The query is prefixed with the "search result" task instruction as recommended
 * by the Gemini Embedding 2 docs.
 */
export async function embedSearchQuery(
    query: string,
    apiKey: string,
): Promise<number[]> {
    const text = `task: search result | query: ${query}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "models/gemini-embedding-2",
            content: { parts: [{ text }] },
            outputDimensionality: 768,
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Gemini Embed ${res.status}: ${body}`);
    }
    const json = (await res.json()) as EmbedContentResponse;
    return json.embedding.values;
}
