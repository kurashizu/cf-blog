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
