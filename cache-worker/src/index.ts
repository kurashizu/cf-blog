import { handleFetch } from "./handlers/fetch";
import { handleScheduled } from "./handlers/scheduled";
import { handleHeartbeatCron } from "./handlers/heartbeat";
import { handleSearchIndexing } from "./handlers/search-index";
import { handleHNCron } from "./handlers/hn-cron";
import type { Env } from "./types";

// Cron schedule → handler routing. Keep these in sync with wrangler.toml
// [triggers] crons.
const DAILY_HN_CRON = "0 5 * * *";
const HEARTBEAT_CRON = "*/3 * * * *";

export default {
    async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
        if (event.cron === DAILY_HN_CRON) {
            await handleHNCron(env);
        } else if (event.cron === HEARTBEAT_CRON) {
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
