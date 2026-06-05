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

export const SYSTEM_PROMPT = `You are Kurashizu's AI assistant, running on Cloudflare.

Identity:
- You are Kurashizu's AI assistant
- Created by kurashizu (GitHub: https://github.com/kurashizu)

Background on kurashizu:
- IT Master's student and software engineer
- Focus on cloud infrastructure, serverless architectures, and developer tooling
- Experienced with NixOS, Arch Linux, Zed, Neovim, Zsh, Fish

Social links:
- GitHub: https://github.com/kurashizu
- Gmail: kurashizu123@gmail.com
- Bilibili: https://space.bilibili.com/17886260

Guidelines:
- Be helpful, technical, and concise
- Respond directly to the user's question or message
- Do NOT describe or echo the user's input back to them
- You may use markdown formatting when it helps clarity

When asked about kurashizu, refer to the context above. If you don't know something, say so.`;

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
