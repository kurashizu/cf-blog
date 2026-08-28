import { get, writable } from 'svelte/store';
import { playSound } from '../sound';
import { modularSynth } from '../synth';
import { encodeWav, bufferLevels } from '../wav';
import { currentSongName } from './synth-patch';

export type RenderPhase = 'idle' | 'rendering' | 'done' | 'error';

export const renderPhase = writable<RenderPhase>('idle');
/** 0..1 within the current stage; null when idle. */
export const renderProgress = writable<{ stage: 'schedule' | 'render'; fraction: number } | null>(null);
/** Human-readable outcome of the last render — real measured values only. */
export const renderReport = writable<string[] | null>(null);

function formatDuration(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds - m * 60;
	return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function currentName(): string {
	const slug = get(currentSongName)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	return slug || 'krsz-patch';
}

/**
 * Render the pattern offline and hand the result to the browser as a WAV —
 * free of the scheduling jitter a live MediaRecorder capture picks up, and
 * without having to sit through the song. The report states the measured
 * speed rather than promising one.
 */
export async function handleRenderWav(): Promise<void> {
	if (get(renderPhase) === 'rendering') return;
	renderPhase.set('rendering');
	renderReport.set(null);
	playSound('click');

	// Yield once so the button's "RENDERING…" state paints before the
	// synchronous scheduling pass takes the main thread.
	await new Promise((r) => setTimeout(r, 0));

	const startedAt = performance.now();
	try {
		const buffer = await modularSynth.renderOffline({
			onProgress: (stage, fraction) => renderProgress.set({ stage, fraction })
		});
		const elapsed = (performance.now() - startedAt) / 1000;
		const blob = encodeWav(buffer);
		const { peakDb, rmsDb } = bufferLevels(buffer);

		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${currentName()}-${Math.round(buffer.duration)}s.wav`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		renderPhase.set('done');
		renderProgress.set(null);
		renderReport.set([
			`✓ ${a.download}`,
			`${formatDuration(buffer.duration)} · ${buffer.sampleRate / 1000} kHz · 16-bit stereo · ${(blob.size / 1024 / 1024).toFixed(1)} MB`,
			`peak ${peakDb.toFixed(1)} dBFS · rms ${rmsDb.toFixed(1)} dBFS`,
			`rendered in ${elapsed.toFixed(1)}s (${(buffer.duration / elapsed).toFixed(1)}× real time)`,
			...(peakDb > -0.1 ? ['peak is at full scale — lower the master or track volumes to avoid clipping'] : [])
		]);
		playSound('ping', true);
	} catch (e) {
		renderPhase.set('error');
		renderProgress.set(null);
		renderReport.set(['✕ Render failed', e instanceof Error ? e.message : String(e)]);
		playSound('ping', false);
	}
}

export function clearRenderReport(): void {
	renderReport.set(null);
	renderProgress.set(null);
	renderPhase.set('idle');
}
