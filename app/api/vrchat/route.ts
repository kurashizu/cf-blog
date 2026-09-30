import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createFootprintsRepo, deriveVrchatFootprint } from "@/lib/footprints";
import { createGuestbookRepo } from "@/lib/guestbook";
import {
    VRCHAT_POSTER_NAME,
    isBrowserUserAgent,
    parseVrchatInput,
} from "@/lib/vrchat";
import { checkBurst, checkDailyKV, getIP } from "@/shared/ratelimiter";
import type { BlogEnv } from "@/lib/types/env";
import { withApiAudit, type ApiAuditContext } from "@/lib/api-audit";

/**
 * The VRChat world's one endpoint: a guestbook post or a footprint. A world
 * can only issue a GET (VRCStringDownloader), and only for a URL the player
 * typed into a VRCUrlInputField — so the world prefills the field with a
 * template and the player types after it:
 *
 *   GET https://blog.krsz.in/api/vrchat?msg=<padding>Your message (Optional): <message>
 *
 * An intact template with a non-blank message posts it to the guestbook
 * (name "VRChat Player", no email). Anything else — blank message, a deleted or
 * edited part of the template, no query — registers a footprint instead.
 * See `parseVrchatInput` for the exact rules.
 *
 * Limit: five registrations per IP per day, posts and footprints together
 * (one KV count, `vrchat` — separate from the website form's and button's).
 * Only a registration that goes through uses one up; a rejected or invalid
 * request does not.
 *
 * Response: 200 `{ "status": ... }` for every expected outcome, so the
 * world reads one field instead of handling HTTP errors.
 *
 * `message`    guestbook post published
 * `footprint`  footprint registered
 * `daily`      nothing registered: this IP's five for the day are used up
 * `too-long`   nothing registered: post over 2000 characters
 * `no-edge`    nothing registered: a footprint needs edge geo and the
 *              request had none (not served through Cloudflare)
 * `rate`       burst limit hit (2 per 10 s), retry in a few seconds
 * `rejected`   the User-Agent looks like a browser, not the VRChat client
 *
 * An unexpected failure is a 500 `{ "status": "error" }`.
 *
 * No secret guards this: anything shipped inside a world can be unpacked.
 * The per-IP limits are the real control. The message is never logged —
 * the access log keeps no query string — only which branch ran and, for a
 * footprint that fell through, why.
 */

const BURST_LIMIT = 2;
const BURST_PERIOD = 10;
const DAILY_LIMIT = 5;

type Status =
    | "message"
    | "footprint"
    | "daily"
    | "too-long"
    | "no-edge"
    | "rate"
    | "rejected";

function reply(status: Status | "error", httpStatus = 200): Response {
    return NextResponse.json(
        { status },
        // A write behind a GET must never be served from a cache.
        { status: httpStatus, headers: { "Cache-Control": "no-store" } },
    );
}

export async function GET(request: NextRequest) {
    return withApiAudit(request, "/api/vrchat", (audit) =>
        handleVrchat(request, audit),
    );
}

async function handleVrchat(
    request: NextRequest,
    audit: ApiAuditContext,
): Promise<Response> {
    try {
        const ctx = getCloudflareContext();
        const env = ctx.env as unknown as BlogEnv;

        const ip = getIP(request);

        // Burst first: it is the cheap check and bounds everything below.
        const burstResp = await checkBurst(
            env.GUESTBOOK_RATE_LIMIT,
            ip,
            BURST_LIMIT,
            BURST_PERIOD,
        );
        if (burstResp) {
            audit.set({ outcome: "rate_limited", metadata: { limit: "burst" } });
            return reply("rate");
        }

        const ua = request.headers.get("user-agent") ?? "";
        if (isBrowserUserAgent(ua)) {
            audit.set({
                outcome: "bad_request",
                metadata: { rejected: "browser-ua" },
            });
            return reply("rejected");
        }

        const input = parseVrchatInput(new URL(request.url).search);
        if (input.kind === "too-long") {
            audit.set({
                outcome: "bad_request",
                metadata: { rejected: "too-long" },
            });
            return reply("too-long");
        }

        // Settle what to write, and that it can be written, before the daily
        // check: checkDailyKV uses the quota up when it passes.
        let write: () => Promise<Status>;
        if (input.kind === "message") {
            write = async () => {
                await createGuestbookRepo().add({
                    name: VRCHAT_POSTER_NAME,
                    content: input.content,
                });
                // Length only — the message itself never goes into the log.
                audit.set({
                    metadata: {
                        mode: "message",
                        content_len: input.content.length,
                    },
                });
                return "message";
            };
        } else {
            const cf = ctx.cf as
                | { country?: string; timezone?: string; colo?: string }
                | undefined;
            const footprint = deriveVrchatFootprint(cf, ua);
            if (!footprint) {
                audit.set({
                    outcome: "error",
                    metadata: { mode: "footprint", rejected: "no-edge" },
                });
                return reply("no-edge");
            }
            write = async () => {
                const stamped = await createFootprintsRepo().add(footprint);
                audit.set({
                    metadata: {
                        mode: "footprint",
                        fallback: input.reason,
                        country: stamped.country,
                    },
                });
                return "footprint";
            };
        }

        const dailyResp = await checkDailyKV(
            env.SESSION_KV,
            "vrchat",
            ip,
            DAILY_LIMIT,
        );
        if (dailyResp) {
            audit.set({
                outcome: "rate_limited",
                metadata: { mode: input.kind, limit: "daily" },
            });
            return reply("daily");
        }

        return reply(await write());
    } catch (error) {
        console.error("VRChat endpoint error:", error);
        audit.set({
            errorMessage:
                error instanceof Error ? error.message : String(error),
        });
        return reply("error", 500);
    }
}
