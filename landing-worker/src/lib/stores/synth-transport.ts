import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { modularSynth, METER_SPECS, type TimeSignature, type NoteDurationDiv } from '../synth';

export const isSeqPlaying = writable<boolean>(modularSynth.isPlayingSeq());
/** Live playhead position while the sequencer is running, driven by modularSynth.subscribeStep. */
export const seqCurrentStep = writable<number>(modularSynth.getCurrentStep());
/** Edit-time cursor position — where PLAY starts from, and where piano-roll clicks land. */
export const cursorStep = writable<number>(0);
export const bpm = writable<number>(modularSynth.getBpm());
export const activeTrackId = writable<number>(0);
export const totalPatternSteps = writable<number>(modularSynth.getTotalSteps());
export const timeMeter = writable<TimeSignature>(modularSynth.getMeter());
export const snapDiv = writable<NoteDurationDiv>('1/4');
export const noteDur = writable<NoteDurationDiv>('1/4');
export const activeStepPage = writable<number>(0);
export const pageInputStr = writable<string>('1');
export const pageFollow = writable<boolean>(true);

let stepUnsub: (() => void) | null = null;

/** Wires the singleton's step pub/sub — call once, client-side, from onMount. */
export function initTransport(): () => void {
	if (!browser) return () => {};

	let animId = 0;
	let pendingStep: number | null = null;
	stepUnsub = modularSynth.subscribeStep((step) => {
		pendingStep = step;
		if (!animId) {
			animId = requestAnimationFrame(() => {
				animId = 0;
				if (pendingStep !== null) {
					seqCurrentStep.set(pendingStep);
					if (get(pageFollow)) {
						const meterSteps = (METER_SPECS[get(timeMeter)] || METER_SPECS['4/4']).stepsPerBar;
						const p = Math.floor(pendingStep / meterSteps);
						activeStepPage.set(p);
						pageInputStr.set(String(p + 1));
					}
					pendingStep = null;
				}
			});
		}
	});

	return () => {
		stepUnsub?.();
		stepUnsub = null;
		if (animId) cancelAnimationFrame(animId);
	};
}

export function setBpm(value: number): void {
	modularSynth.setBpm(value);
	bpm.set(value);
}

export function setTimeMeter(m: TimeSignature): void {
	modularSynth.setMeter(m);
	timeMeter.set(m);
}

export function setSnapDiv(d: NoteDurationDiv): void {
	snapDiv.set(d);
}

export function setNoteDur(d: NoteDurationDiv): void {
	noteDur.set(d);
	modularSynth.setEditNoteDiv(d);
}

export function setTotalPatternSteps(n: number): void {
	modularSynth.setTotalSteps(n);
	totalPatternSteps.set(n);
	const stepsCount = (METER_SPECS[get(timeMeter)] || METER_SPECS['4/4']).stepsPerBar;
	const maxPages = Math.max(1, Math.ceil(n / stepsCount));
	if (get(activeStepPage) >= maxPages) activeStepPage.set(0);
}

export function play(fromStep?: number): void {
	modularSynth.startSequencer(fromStep);
	isSeqPlaying.set(true);
}

export function stop(): void {
	modularSynth.stopSequencer();
	isSeqPlaying.set(false);
}

export function toggle(fromStep?: number): boolean {
	const playing = modularSynth.toggleSequencer(fromStep);
	isSeqPlaying.set(playing);
	return playing;
}

export function jumpPlayheadToCursor(): void {
	const step = get(cursorStep);
	modularSynth.setPlaybackStep(step);
	seqCurrentStep.set(step);
}

function setPlaybackAndCursor(step: number): void {
	modularSynth.setPlaybackStep(step);
	cursorStep.set(step);
	seqCurrentStep.set(step);
}

export function rewindToStart(): void {
	setPlaybackAndCursor(0);
}

export function stepBar(direction: 1 | -1): void {
	const barSteps = (METER_SPECS[get(timeMeter)] || METER_SPECS['4/4']).stepsPerBar || 96;
	const cur = modularSynth.getCurrentStep() || 0;
	const next =
		direction === -1 ? Math.max(0, cur - barSteps) : Math.min(get(totalPatternSteps) - 1, cur + barSteps);
	setPlaybackAndCursor(next);
}
