import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Cloudflare's `/cdn-cgi/trace` — the only edge telemetry on this site that is
 * actually measured rather than asserted. Every field below is a verbatim value
 * from that endpoint; nothing here is derived or embellished.
 */
export interface EdgeTrace {
	/** IATA code of the Cloudflare PoP that served the request, e.g. "SYD". */
	colo: string;
	/** ISO country of that PoP, e.g. "AU". */
	loc: string;
	ip: string;
	/** Negotiated protocol, e.g. "http/2", "http/3". */
	http: string;
	tls: string;
	/** TLS key-exchange group, e.g. "X25519". */
	kex: string;
	warp: string;
	scheme: string;
	/** Cloudflare's own request id. */
	fl: string;
	raw: Record<string, string>;
}

export type TraceStatus = 'idle' | 'probing' | 'ok' | 'unavailable';

export const edgeTrace = writable<EdgeTrace | null>(null);
export const edgeTraceStatus = writable<TraceStatus>('idle');
/** Round trip of the trace fetch itself, ms — a real browser-to-edge measurement. */
export const edgeTraceMs = writable<number | null>(null);

/** `/cdn-cgi/trace` sends `Access-Control-Allow-Origin: *`, so the apex works as a dev fallback. */
const TRACE_URLS = ['/cdn-cgi/trace', 'https://krsz.in/cdn-cgi/trace'];

function parseTrace(body: string): EdgeTrace | null {
	const raw: Record<string, string> = {};
	for (const line of body.trim().split('\n')) {
		const eq = line.indexOf('=');
		if (eq > 0) raw[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
	}
	// `colo` is the one field that proves this really came from the edge endpoint.
	if (!raw.colo) return null;
	return {
		colo: raw.colo,
		loc: raw.loc ?? '',
		ip: raw.ip ?? '',
		http: raw.http ?? '',
		tls: raw.tls ?? '',
		kex: raw.kex ?? '',
		warp: raw.warp ?? '',
		scheme: raw.visit_scheme ?? '',
		fl: raw.fl ?? '',
		raw
	};
}

async function fetchTrace(url: string): Promise<{ trace: EdgeTrace; ms: number } | null> {
	const t0 = performance.now();
	try {
		const res = await fetch(url, { cache: 'no-store' });
		if (!res.ok) return null;
		const trace = parseTrace(await res.text());
		return trace ? { trace, ms: performance.now() - t0 } : null;
	} catch {
		return null;
	}
}

let inflight: Promise<EdgeTrace | null> | null = null;

/**
 * Resolve the edge trace once per session. Returns the cached value on repeat
 * calls; concurrent callers share one in-flight request.
 */
export function loadEdgeTrace(force = false): Promise<EdgeTrace | null> {
	if (!browser) return Promise.resolve(null);
	const cached = get(edgeTrace);
	if (cached && !force) return Promise.resolve(cached);
	if (inflight && !force) return inflight;

	edgeTraceStatus.set('probing');
	inflight = (async () => {
		for (const url of TRACE_URLS) {
			const hit = await fetchTrace(url);
			if (hit) {
				edgeTrace.set(hit.trace);
				edgeTraceMs.set(Math.round(hit.ms));
				edgeTraceStatus.set('ok');
				inflight = null;
				return hit.trace;
			}
		}
		edgeTraceStatus.set('unavailable');
		inflight = null;
		return null;
	})();
	return inflight;
}

/** `SYD/AU · http/2 · TLSv1.3` — the compact footer form. Empty string until resolved. */
export function traceSummary(t: EdgeTrace | null): string {
	if (!t) return '';
	const where = t.loc ? `${t.colo}/${t.loc}` : t.colo;
	return [where, t.http, t.tls].filter(Boolean).join(' · ');
}
