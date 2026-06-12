/**
 * @deprecated Import from `@/shared/ratelimiter` instead. This file is kept
 * as a re-export so existing route handlers don't need to change.
 */
export {
    type RateLimitError,
    hashIP,
    checkBurst,
    checkDailyKV,
    getIP,
} from "../../shared/ratelimiter";
