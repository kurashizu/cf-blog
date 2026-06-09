import type { Rom } from "./types";
import { LOCAL_ROMS } from "./roms.generated";

// Re-export so consumers can import either side from this file.
export { LOCAL_ROMS };

/**
 * Remote ROMs loaded from a URL at runtime (vs LOCAL_ROMS which are
 * served as static files from public/roms/).
 *
 * CORS: the remote server must respond with
 * Access-Control-Allow-Origin: * (or the page's origin) for the browser
 * XHR in Browser.loadROMFromURL to succeed. CORS-friendly hosts:
 *   - raw.githubusercontent.com (GitHub raw)
 *   - Your own Cloudflare R2 bucket (configure CORS in the R2 dashboard)
 *
 * License: only add ROMs you own or that are freely licensed
 * (public domain, homebrew, etc.). Don't ship commercial ROMs.
 */
export const REMOTE_ROMS: Rom[] = [];

/** Combined list shown in the ROM picker. */
export const ROMS: Rom[] = [...LOCAL_ROMS, ...REMOTE_ROMS];

export function findRom(id: string): Rom | undefined {
    return ROMS.find((r) => r.id === id);
}
