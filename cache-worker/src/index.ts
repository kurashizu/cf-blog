import { handleFetch } from "./handlers/fetch";
import { handleScheduled } from "./handlers/scheduled";
import { handleHeartbeatCron } from "./handlers/heartbeat";
import { handleSearchIndexing } from "./handlers/search-index";
import type { Env } from "./types";

export default {
    async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
        if (event.cron === "*/3 * * * *") {
            await handleHeartbeatCron(env);
            const searchResult = await handleSearchIndexing(env);
            console.log(`Search indexing: ${searchResult.detail}`);
        } else {
            await handleScheduled(env);
        }
    },

    async fetch(request: Request, env: Env): Promise<Response> {
        return handleFetch(request, env);
    },
};
