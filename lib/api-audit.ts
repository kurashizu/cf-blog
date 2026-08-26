/**
 * cf-blog binding of the shared inbound request audit.
 *
 * Wraps `shared/api-audit.ts` with this worker's Cloudflare context so
 * route handlers only need the route name:
 *
 *   export async function POST(request: NextRequest) {
 *       return withApiAudit(request, "/api/llm", async (audit) => {
 *           ...
 *           audit.set({ model, inputTokens, outputTokens });
 *           return NextResponse.json(...);
 *       });
 *   }
 *
 * The access row is written via `ctx.waitUntil`, so it never delays the
 * response, and a failed write never breaks the request.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
    runApiAudit,
    type ApiAuditContext,
    type ApiAuditEnv,
} from "@/shared/api-audit";

export type { ApiAuditContext } from "@/shared/api-audit";

const WORKER = "cf-blog";

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
