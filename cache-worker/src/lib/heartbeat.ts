import { generateItemRewrite } from "./sources";
import type { Env, HNStory } from "../types";

export async function handleHeartbeat(
    env: Env,
): Promise<{ ok: boolean; detail: string }> {
    if (!env.GEMINI_API_KEY) {
        return { ok: false, detail: "GEMINI_API_KEY not set" };
    }

    const row = await env.DB.prepare(
        "SELECT * FROM news_items WHERE summary = '' ORDER BY time ASC LIMIT 1",
    ).first();

    if (!row) {
        return { ok: true, detail: "nothing pending" };
    }

    const story = row as unknown as HNStory;

    try {
        const rewrite = await generateItemRewrite(story, env.GEMINI_API_KEY);

        await env.DB.prepare(
            "UPDATE news_items SET summary = ?, search_updated_at = NULL WHERE id = ?",
        )
            .bind(rewrite, story.id)
            .run();

        return {
            ok: true,
            detail: `${story.id}: rewrite generated (${rewrite.length} chars)`,
        };
    } catch (e) {
        return {
            ok: false,
            detail: `${story.id}: failed - ${e instanceof Error ? e.message : String(e)}`,
        };
    }
}
