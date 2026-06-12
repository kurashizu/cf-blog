/**
 * KurAgent network config.
 *
 * `AGENT_API` is the upstream endpoint for streaming chat. Override via the
 * `NEXT_PUBLIC_AGENT_API` env var in `next.config.js` (or in your shell when
 * running `next dev`) to point at a local agent-worker.
 */
const DEFAULT_AGENT_API =
    "https://cf-agent.kurashizu123.workers.dev/api/chat";

export const AGENT_API: string =
    process.env.NEXT_PUBLIC_AGENT_API ?? DEFAULT_AGENT_API;

/** Derive the /api/tool endpoint from the chat endpoint. */
export const TOOL_LIST_API = AGENT_API.replace(/\/chat$/, "/tool");

/**
 * Theme prefix map. The compact Agent card shows one of three image variants
 * based on the active color theme. Keep in sync with the asset folders
 * under `public/images/kuragent/`.
 */
export const THEME_PREFIX = {
    dark: "r",
    "deep-blue": "b",
    "deep-green": "g",
} as const;
export type ThemeKey = keyof typeof THEME_PREFIX;
export const ALL_THEME_PREFIXES = ["r", "g", "b"] as const;
