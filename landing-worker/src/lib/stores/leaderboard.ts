import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * The model table behind blog.krsz.in's LLM leaderboard: Artificial Analysis'
 * v2 language-models API, pulled by cache-worker into D1 and served by the
 * blog. Nothing is recomputed here — every number displayed is a field of this
 * payload, and a model missing a field is shown as missing.
 */
export interface LeaderboardModel {
	name: string;
	slug: string;
	release_date: string | null;
	model_creator?: { name?: string };
	evaluations?: {
		artificial_analysis_intelligence_index?: number | null;
		artificial_analysis_coding_index?: number | null;
		artificial_analysis_agentic_index?: number | null;
	};
	pricing?: {
		price_1m_blended_3_to_1?: number | null;
		price_1m_input_tokens?: number | null;
		price_1m_output_tokens?: number | null;
	};
	median_output_tokens_per_second?: number | null;
	median_time_to_first_token_seconds?: number | null;
}

export interface LeaderboardPayload {
	models: LeaderboardModel[];
	fetchedAt: string | null;
	intelligenceIndexVersion: number | null;
}

export type LeaderboardStatus = 'idle' | 'loading' | 'ok' | 'error';

export const LEADERBOARD_URL = 'https://blog.krsz.in/api/llm-leaderboard';

export const leaderboard = writable<LeaderboardPayload | null>(null);
export const leaderboardStatus = writable<LeaderboardStatus>('idle');
export const leaderboardError = writable<string | null>(null);
/** Round trip of the fetch, ms — measured here, in your browser. */
export const leaderboardMs = writable<number | null>(null);

let inflight: Promise<LeaderboardPayload | null> | null = null;

export function loadLeaderboard(force = false): Promise<LeaderboardPayload | null> {
	if (!browser) return Promise.resolve(null);
	if (get(leaderboard) && !force) return Promise.resolve(get(leaderboard));
	if (inflight && !force) return inflight;

	leaderboardStatus.set('loading');
	leaderboardError.set(null);
	const t0 = performance.now();

	inflight = (async () => {
		try {
			const res = await fetch(LEADERBOARD_URL, { cache: 'no-store' });
			if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
			const data = (await res.json()) as LeaderboardPayload;
			if (!Array.isArray(data.models)) throw new Error('unexpected payload shape');
			leaderboard.set(data);
			leaderboardMs.set(Math.round(performance.now() - t0));
			leaderboardStatus.set(data.models.length ? 'ok' : 'error');
			if (!data.models.length) leaderboardError.set('The upstream cache is empty right now.');
			return data;
		} catch (e) {
			leaderboardError.set(e instanceof Error ? e.message : 'request failed');
			leaderboardStatus.set('error');
			return null;
		} finally {
			inflight = null;
		}
	})();
	return inflight;
}
