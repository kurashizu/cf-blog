import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AgentEnv } from "../../lib/types/env";

export function getAgentEnv(): AgentEnv {
    const ctx = getCloudflareContext();
    return ctx.env as unknown as AgentEnv;
}
