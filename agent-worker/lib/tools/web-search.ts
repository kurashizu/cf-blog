import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Tool } from "./index";
import type { AgentEnv } from "../../../lib/types/env";

export const webSearchTool: Tool = {
    name: "web_search",
    description:
        "Search the web using Brave Search API. Use this when you need to find current information, facts, or answers that require live web data.",
    example: JSON.stringify({ q: "how deep is the mediterranean sea" }),
    parameters: {
        type: "object",
        properties: {
            q: { type: "string", description: "The search query" },
        },
        required: ["q"],
    },
    execute: async ({ q }) => {
        const ctx = getCloudflareContext();
        const env = ctx.env as unknown as AgentEnv;
        const apiKey = env.BRAVE_API_KEY as string;

        const resp = await fetch(
            "https://api.search.brave.com/res/v1/llm/context",
            {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Accept-Encoding": "gzip",
                    "x-subscription-token": apiKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    q,
                    country: "AU",
                    search_lang: "en",
                    maximum_number_of_tokens: 4096,
                }),
            },
        );

        if (!resp.ok) {
            return {
                success: false,
                error: `Brave API error ${resp.status}: ${await resp.text()}`,
            };
        }

        const data = await resp.json();
        return { success: true, result: data };
    },
};
