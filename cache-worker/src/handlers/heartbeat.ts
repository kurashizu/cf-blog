import { handleHeartbeat } from "../lib/heartbeat";
import type { Env } from "../types";

export async function handleHeartbeatCron(env: Env): Promise<void> {
    console.log("Heartbeat cron");
    const result = await handleHeartbeat(env);
    console.log(`Heartbeat: ${result.detail}`);
}
