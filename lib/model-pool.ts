/// <reference types="node" />
/// <reference types="@cloudflare/workers-types" />
/**
 * Model pool with quota-based fallback for Gemini models.
 *
 * Models: ["gemma-4-31b-it", "gemma-4-26b-a4b-it"]
 * Default = pool[0]
 * On TPD 429 (daily quota exhausted) → mark exhausted → try next model
 * On RPM 429 (minute burst) → sleep 1s → retry same model
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const QUOTA_TTL = 25 * 3600; // 25 hours TTL for quota entries

export interface ModelQuota {
    requests: number;
    exhausted: boolean;
    exhaustedAt?: string;
}

export interface CallOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
}

import { getTodayUTC } from "@/shared/date";

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

/** Parse GEMINI_MODELS env var (JSON array string) */
export function getModelPool(env: { GEMINI_MODELS?: string }): string[] {
    try {
        const raw = env.GEMINI_MODELS ?? '["gemma-4-31b-it"]';
        return JSON.parse(raw) as string[];
    } catch {
        return ["gemma-4-31b-it"];
    }
}

export function getDefaultModel(env: { GEMINI_MODELS?: string }): string {
    const pool = getModelPool(env);
    return pool[0];
}

function quotaKey(model: string): string {
    return `quota:${model}:${getTodayUTC()}`;
}

/** Check if a model is exhausted (quota used up) */
export async function isModelExhausted(
    model: string,
    kv: KVNamespace | undefined,
): Promise<boolean> {
    if (!kv) return false;
    try {
        const raw = await kv.get(quotaKey(model), "json");
        const quota = raw as ModelQuota | null;
        return quota?.exhausted === true;
    } catch {
        return false;
    }
}

/** Mark a model as exhausted (TPD quota hit) */
export async function markModelExhausted(
    model: string,
    kv: KVNamespace | undefined,
): Promise<void> {
    if (!kv) return;
    try {
        const key = quotaKey(model);
        const raw = await kv.get(key, "json");
        const quota = (raw as ModelQuota | null) ?? {
            requests: 0,
            exhausted: false,
        };
        quota.exhausted = true;
        quota.exhaustedAt = new Date().toISOString();
        await kv.put(key, JSON.stringify(quota), { expirationTtl: QUOTA_TTL });
    } catch {
        // KV write failure — treat as not exhausted
    }
}

/** Increment request count for a model */
export async function incrementQuota(
    model: string,
    kv: KVNamespace | undefined,
): Promise<void> {
    if (!kv) return;
    try {
        const key = quotaKey(model);
        const raw = await kv.get(key, "json");
        const quota = (raw as ModelQuota | null) ?? {
            requests: 0,
            exhausted: false,
        };
        quota.requests = (quota.requests ?? 0) + 1;
        await kv.put(key, JSON.stringify(quota), { expirationTtl: QUOTA_TTL });
    } catch {
        // KV write failure — non-critical
    }
}

/** Detect TPD (daily quota) 429 vs RPM (burst) 429 */
export function isTPDLimit(errBody: unknown): boolean {
    const msg = extractErrorMessage(errBody);
    const lower = msg.toLowerCase();
    return (
        lower.includes("quota") ||
        lower.includes("exhausted") ||
        lower.includes("daily") ||
        lower.includes("tpd")
    );
}

/** Best-effort extraction of the human-readable message from a Gemini error body. */
function extractErrorMessage(errBody: unknown): string {
    if (!errBody || typeof errBody !== "object") return "";
    const obj = errBody as Record<string, unknown>;
    const error = obj.error;
    if (error && typeof error === "object") {
        const message = (error as Record<string, unknown>).message;
        if (typeof message === "string") return message;
    }
    if (typeof error === "string") return error;
    return "";
}

/** Make a single Gemini API call */
async function fetchGemini(
    apiKey: string,
    model: string,
    contents: object[],
    options?: CallOptions,
    systemInstruction?: string,
): Promise<Response> {
    const generationConfig: Record<string, unknown> = {
        temperature: options?.temperature ?? 0.9,
        maxOutputTokens: options?.maxTokens ?? 8192,
        topP: options?.topP ?? 0.95,
        topK: options?.topK ?? 40,
    };

    const body: Record<string, unknown> = { contents, generationConfig };
    if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;
    return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

/**
 * Call Gemini with model pool fallback.
 * Cycles through models on TPD 429, retries same model once on RPM 429.
 */
export async function callWithFallback(
    apiKey: string,
    models: string[],
    contents: object[],
    options?: CallOptions,
    kv?: KVNamespace,
    systemInstruction?: string,
): Promise<{ response: Response; model: string; hitIterationLimit?: boolean }> {
    let hitIterationLimit = false;

    for (const model of models) {
        if (await isModelExhausted(model, kv)) continue;

        // First attempt
        let resp = await fetchGemini(
            apiKey,
            model,
            contents,
            options,
            systemInstruction,
        );

        // RPM 429: retry same model once after 1s
        if (resp.status === 429) {
            const errBody = await resp
                .clone()
                .json()
                .catch(() => ({}));
            if (!isTPDLimit(errBody)) {
                await sleep(1000);
                resp = await fetchGemini(
                    apiKey,
                    model,
                    contents,
                    options,
                    systemInstruction,
                );
            }
        }

        // Still 429 after retry: check if TPD → mark exhausted, try next model
        if (resp.status === 429) {
            const errBody = await resp
                .clone()
                .json()
                .catch(() => ({}));
            if (isTPDLimit(errBody)) {
                await markModelExhausted(model, kv);
                continue;
            }
        }

        if (resp.ok) {
            await incrementQuota(model, kv);
        }

        return { response: resp, model, hitIterationLimit };
    }

    // All models exhausted
    return {
        response: new Response(
            JSON.stringify({
                error: "All model quotas exhausted",
                retryAfter: 3600,
            }),
            { status: 429, headers: { "Content-Type": "application/json" } },
        ),
        model: models[0],
    };
}

/** Streaming variant — uses streamGenerateContent but cycles models on TPD 429 */
export async function streamWithFallback(
    apiKey: string,
    models: string[],
    contents: object[],
    options?: CallOptions,
    kv?: KVNamespace,
    systemInstruction?: string,
): Promise<{ response: Response; model: string }> {
    for (const model of models) {
        if (await isModelExhausted(model, kv)) continue;

        const generationConfig: Record<string, unknown> = {
            temperature: options?.temperature ?? 0.9,
            maxOutputTokens: options?.maxTokens ?? 8192,
            topP: options?.topP ?? 0.95,
            topK: options?.topK ?? 40,
        };

        const body: Record<string, unknown> = { contents, generationConfig };
        if (systemInstruction) {
            body.systemInstruction = { parts: [{ text: systemInstruction }] };
        }

        const streamUrl = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
        const resp = await fetch(streamUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (resp.status === 429) {
            const errBody = await resp
                .clone()
                .json()
                .catch(() => ({}));
            if (isTPDLimit(errBody)) {
                await markModelExhausted(model, kv);
                continue;
            }
        }

        if (resp.ok) {
            await incrementQuota(model, kv);
        }

        return { response: resp, model };
    }

    return {
        response: new Response(
            JSON.stringify({
                error: "All model quotas exhausted",
                retryAfter: 3600,
            }),
            { status: 429, headers: { "Content-Type": "application/json" } },
        ),
        model: models[0],
    };
}
