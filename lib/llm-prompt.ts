/**
 * System prompt and Gemini message types for the blog's LLM proxy.
 *
 * This is the only surviving content from the old `lib/gemini.ts`, which has
 * been deleted because `lib/model-pool.ts` is the single source of truth for
 * all Gemini calls.
 *
 * The prompt is intentionally short and permissive: the previous verbose
 * version (strict "no markdown" rules, etc.) caused the Gemma 4 26B/31B
 * models to degenerate into meta-narration ("User says: ...") instead of
 * answering. Per the Gemma 4 docs the 26B/31B models occasionally emit a
 * thought channel even when thinking is off, so we let the model format
 * responses naturally and just steer it away from echoing the user.
 */

export const SYSTEM_PROMPT = `You are Kurashizu's AI assistant.

Guidelines:
- Be helpful, technical, and concise
- Respond directly to the user's question or message
- Do NOT describe or echo the user's input back to them
- You may use markdown formatting when it helps clarity`;

export interface GeminiMessage {
    role: "user" | "model";
    parts: { text: string }[];
}

export interface GeminiGenerateOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
}
