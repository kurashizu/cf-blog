/**
 * cf-blog-cache entrypoint. Wires the two worker entrypoints (cron + http)
 * to their respective handlers. The data, sources, and orchestrator live
 * under `lib/`; the per-trigger adapters under `handlers/`.
 */
import { handleFetch } from "./handlers/fetch";
import { handleScheduled } from "./handlers/scheduled";

export default {
    async scheduled(
        _event: ScheduledEvent,
        env: import("./types").Env,
    ): Promise<void> {
        await handleScheduled(env);
    },

    async fetch(
        request: Request,
        env: import("./types").Env,
    ): Promise<Response> {
        return handleFetch(request, env);
    },
};
