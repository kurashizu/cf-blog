import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { MODULES } from '../data/modules';

export interface ProbeResult {
	status: 'idle' | 'probing' | 'up' | 'unreachable';
	/** Best round-trip of the sample set, ms — measured from THIS visitor's browser. */
	ms: number | null;
}

const initial: Record<string, ProbeResult> = Object.fromEntries(
	MODULES.map((m) => [m.id, { status: 'idle', ms: null } as ProbeResult])
);

export const probeResults = writable<Record<string, ProbeResult>>(initial);

/**
 * One browser-side reachability probe. `no-cors` keeps every origin probeable —
 * the response is opaque (no status code), but resolution proves the host
 * answered, and the timing is a real client-to-edge round trip.
 */
export async function probeOnce(url: string): Promise<number> {
	const t0 = performance.now();
	await fetch(url, { mode: 'no-cors', cache: 'no-store', redirect: 'follow' });
	return performance.now() - t0;
}

/** N samples; returns each sample plus the best. Throws if the host never answers. */
export async function probeTimes(url: string, n = 2): Promise<{ samples: number[]; best: number }> {
	const samples: number[] = [];
	for (let i = 0; i < n; i++) samples.push(await probeOnce(url));
	return { samples, best: Math.min(...samples) };
}

let ran = false;

/** Probe every showcased project once per session (2 samples each; the first pays TLS setup). */
export async function probeAllProjects(force = false): Promise<void> {
	if (!browser || (ran && !force)) return;
	ran = true;

	await Promise.all(
		MODULES.map(async (m) => {
			probeResults.update((r) => ({ ...r, [m.id]: { status: 'probing', ms: null } }));
			try {
				const { best } = await probeTimes(m.url, 2);
				probeResults.update((r) => ({ ...r, [m.id]: { status: 'up', ms: Math.round(best) } }));
			} catch {
				probeResults.update((r) => ({ ...r, [m.id]: { status: 'unreachable', ms: null } }));
			}
		})
	);
}
