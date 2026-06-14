/**
 * embeddings — call Gemini Embedding 2 to generate vectors, then build
 * VectorizeVector[] ready for upsert.
 */

import type { Chunk } from "./chunker";
import { chunkVectorId } from "./chunker";

const GEMINI_EMBED_MODEL = "gemini-embedding-2";
const EMBED_DIMENSIONS = 768;

interface GeminiEmbedContentRequest {
    model: string;
    content: { parts: { text: string }[] };
    outputDimensionality: number;
}

interface GeminiEmbedContentResponse {
    embedding: { values: number[] };
    usageMetadata?: { promptTokenCount: number };
}

interface GeminiBatchEmbedRequest {
    model: string;
    requests: GeminiEmbedContentRequest[];
}

interface GeminiBatchEmbedResponse {
    embeddings: { values: number[] }[];
    usageMetadata?: { promptTokenCount: number };
}

/**
 * Embed a single text string.
 */
export async function embedText(
    text: string,
    apiKey: string,
): Promise<number[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:embedContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: `models/${GEMINI_EMBED_MODEL}`,
            content: { parts: [{ text }] },
            outputDimensionality: EMBED_DIMENSIONS,
        } satisfies GeminiEmbedContentRequest),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Gemini Embed ${res.status}: ${body}`);
    }
    const json = (await res.json()) as GeminiEmbedContentResponse;
    return json.embedding.values;
}

/**
 * Embed multiple texts in a single batch API call.
 * Returns embeddings in the same order as inputs.
 */
export async function embedBatch(
    texts: string[],
    apiKey: string,
): Promise<number[][]> {
    if (texts.length === 0) return [];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:batchEmbedContents?key=${apiKey}`;
    const requests: GeminiEmbedContentRequest[] = texts.map((t) => ({
        model: `models/${GEMINI_EMBED_MODEL}`,
        content: { parts: [{ text: t }] },
        outputDimensionality: EMBED_DIMENSIONS,
    }));

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: `models/${GEMINI_EMBED_MODEL}`,
            requests,
        } satisfies GeminiBatchEmbedRequest),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Gemini Batch Embed ${res.status}: ${body}`);
    }
    const json = (await res.json()) as GeminiBatchEmbedResponse;
    return json.embeddings.map((e) => e.values);
}

/**
 * Convert chunk list + embeddings into VectorizeVector[] for upsert.
 */
export function buildVectors(
    chunks: Chunk[],
    embeddings: number[][],
): VectorizeVector[] {
    if (chunks.length !== embeddings.length) {
        throw new Error(
            `Mismatch: ${chunks.length} chunks vs ${embeddings.length} embeddings`,
        );
    }
    return chunks.map((chunk, i) => {
        const v: VectorizeVector = {
            id: chunkVectorId(chunk),
            values: embeddings[i],
            metadata: chunk.metadata as unknown as Record<
                string,
                VectorizeVectorMetadata
            >,
        };
        return v;
    });
}
