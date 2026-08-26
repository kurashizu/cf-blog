/**
 * cf-agent binding of the shared inbound request audit.
 *
 * Same contract as cf-blog's `lib/api-audit.ts` — see `shared/api-audit.ts`
 * for the design rules. Rows land in the same `api_access_log` D1 table, so
 * the admin audit view shows both workers' traffic in one place.
 *
 * cf-agent's D1 binding exists solely for this audit trail; if the binding
 * is missing the write is skipped and the request is unaffected.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
    runApiAudit,
    type ApiAuditContext,
    type ApiAuditEnv,
} from "../../shared/api-audit";

export type { ApiAuditContext } from "../../shared/api-audit";

const WORKER = "cf-agent";

export function withApiAudit<T extends Response>(
    request: Request,
    route: string,
    handler: (audit: ApiAuditContext) => Promise<T>,
): Promise<T> {
    const { env, cf, ctx } = getCloudflareContext();
    return runApiAudit({
        request,
        route,
        worker: WORKER,
        env: env as unknown as ApiAuditEnv,
        cf,
        waitUntil: (p) => ctx?.waitUntil?.(p),
        handler,
    });
}
