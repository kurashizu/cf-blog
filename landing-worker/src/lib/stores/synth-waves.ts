/**
 * User-drawn oscillator waves. Each is one cycle of samples; the engine turns
 * it into a PeriodicWave (64 harmonics) on first use. Kept in this browser,
 * registered with the engine on load, and embedded in patches that use them
 * so a shared patch still plays.
 */
import { writable, get } from 'svelte/store';
import { modularSynth, waveParam, type CustomWave, type SynthWaveform, type TrackData, type WaveParams } from '../synth';

const KEY = 'krsz-synth-waves-v1';
export const WAVE_SAMPLES = 128;

function valid(w: unknown): w is CustomWave {
	const c = w as CustomWave;
	return !!c && typeof c.id === 'string' && typeof c.name === 'string' && Array.isArray(c.samples) && c.samples.length >= 8;
}

function load(): CustomWave[] {
	try {
		if (typeof localStorage === 'undefined') return [];
		const raw = localStorage.getItem(KEY);
		const arr = raw ? JSON.parse(raw) : [];
		return Array.isArray(arr) ? arr.filter(valid) : [];
	} catch {
		return [];
	}
}

function persist(list: CustomWave[]) {
	try {
		localStorage.setItem(KEY, JSON.stringify(list));
	} catch {
		/* private mode: the wave still works this visit */
	}
}

export const customWaves = writable<CustomWave[]>(load());
customWaves.subscribe((list) => {
	for (const w of list) modularSynth.registerCustomWave(w);
});

export function customWaveId(w: SynthWaveform | string): string | null {
	return typeof w === 'string' && w.startsWith('custom:') ? w.slice(7) : null;
}

export function findCustomWave(w: SynthWaveform | string): CustomWave | undefined {
	const id = customWaveId(w);
	return id ? get(customWaves).find((c) => c.id === id) : undefined;
}

export function saveCustomWave(name: string, samples: number[]): CustomWave {
	const wave: CustomWave = {
		id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
		name: (name.trim() || 'DRAWN').slice(0, 24).toUpperCase(),
		samples: samples.map((v) => Math.max(-1, Math.min(1, v)))
	};
	customWaves.update((list) => {
		const next = [...list, wave];
		persist(next);
		return next;
	});
	return wave;
}

export function updateCustomWave(id: string, patch: Partial<Pick<CustomWave, 'name' | 'samples'>>): void {
	customWaves.update((list) => {
		const next = list.map((w) => (w.id === id ? { ...w, ...patch, name: (patch.name ?? w.name).trim().slice(0, 24).toUpperCase() || w.name } : w));
		persist(next);
		return next;
	});
}

export function deleteCustomWave(id: string): void {
	modularSynth.unregisterCustomWave(id);
	customWaves.update((list) => {
		const next = list.filter((w) => w.id !== id);
		persist(next);
		return next;
	});
}

/** Waves a patch carries that this browser does not have yet are adopted. */
export function ensureCustomWaves(waves: CustomWave[] | undefined): void {
	if (!waves?.length) return;
	customWaves.update((list) => {
		const have = new Set(list.map((w) => w.id));
		const add = waves.filter((w) => valid(w) && !have.has(w.id));
		if (!add.length) return list;
		const next = [...list, ...add];
		persist(next);
		return next;
	});
}

/** The drawn waves any of these tracks (or their kit keys) reference. */
export function wavesUsedBy(tracks: TrackData[]): CustomWave[] {
	const ids = new Set<string>();
	const note = (w: unknown) => {
		const id = typeof w === 'string' ? customWaveId(w) : null;
		if (id) ids.add(id);
	};
	for (const t of tracks) {
		note(t.osc1Waveform);
		note(t.osc2Waveform);
		for (const k of Object.values(t.keyTimbres ?? {})) {
			note(k.osc1Waveform);
			note(k.osc2Waveform);
		}
	}
	return get(customWaves).filter((w) => ids.has(w.id));
}

/* ---------------- previews ---------------- */

export const WAVE_LABELS: Record<string, string> = {
	square: 'SQR · SQUARE',
	sawtooth: 'SAW · SAWTOOTH',
	triangle: 'TRI · TRIANGLE',
	sine: 'SIN · SINE',
	noise: 'NOI · WHITE NOISE',
	metal: 'MTL · METAL (808 CYMBAL BANK)',
	pwm: 'PWM · PULSE WIDTH MOD',
	supersaw: 'SSAW · SUPERSAW',
	organ: 'ORG · DRAWBAR ORGAN',
	fold: 'FOLD · WAVEFOLDED SINE'
};

/** One cycle of the wave as N points in -1..1, for the little scope under each OSC. */
export function previewSamples(w: SynthWaveform | string, n = 96, params?: WaveParams): number[] {
	const out: number[] = [];
	const custom = findCustomWave(w);
	if (custom) {
		const s = custom.samples;
		for (let i = 0; i < n; i++) out.push(s[Math.floor((i / n) * s.length)] ?? 0);
		return out;
	}
	let seed = 7;
	const rnd = () => {
		seed = (seed * 16807) % 2147483647;
		return seed / 2147483647;
	};
	for (let i = 0; i < n; i++) {
		const x = i / n;
		const ph = 2 * Math.PI * x;
		let v = 0;
		switch (w) {
			case 'square': v = x < 0.5 ? 1 : -1; break;
			case 'sawtooth': v = 2 * x - 1; break;
			case 'triangle': v = 1 - 4 * Math.abs(x - 0.5); break;
			case 'sine': v = Math.sin(ph); break;
			case 'noise': v = rnd() * 2 - 1; break;
			case 'metal': {
				for (const f of [1, 1.48, 1.8, 2.55, 2.63, 3.9]) v += Math.sin(ph * f * 2) >= 0 ? 1 : -1;
				v /= 6;
				break;
			}
			case 'pwm': v = x < waveParam(params, 'pwmWidth') / 100 ? 1 : -1; break;
			case 'supersaw': v = (2 * x - 1) * 0.7 + 0.3 * (2 * ((x * 1.03) % 1) - 1); break;
			case 'organ': {
				const bars = (['org1', 'org2', 'org3', 'org4', 'org5', 'org8'] as const).map((k) => waveParam(params, k) / 8);
				const harm = [1, 2, 3, 4, 5, 8];
				const at = (a: number) => harm.reduce((acc, h, k) => acc + bars[k] * Math.sin(a * h), 0);
				let peak = 0;
				for (let j = 0; j < n; j++) peak = Math.max(peak, Math.abs(at((2 * Math.PI * j) / n)));
				v = at(ph) / (peak || 1);
				break;
			}
			case 'fold': v = Math.sin(waveParam(params, 'foldAmt') * Math.sin(ph)); break;
			default: v = Math.sin(ph);
		}
		out.push(v);
	}
	return out;
}

/** SVG path for a 100×30 viewBox. */
export function previewPath(samples: number[]): string {
	const n = samples.length;
	return samples.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (n - 1)) * 100).toFixed(1)},${(15 - v * 13).toFixed(1)}`).join(' ');
}
