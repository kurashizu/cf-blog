<script lang="ts">
	import { ensureLiveDsp, createLiveDsp } from '$lib/audio/live-dsp';
	/**
	 * A bench for hearing whether a patch does what it says.
	 *
	 * The unit tests build patches against a recording context and assert on
	 * what got connected. That finds a cable landing on the wrong param and it
	 * cannot find a patch that sounds wrong, because a fake context produces no
	 * samples -- so "the knob reads zero" got asserted and "the sound stops"
	 * never did. The two are not the same claim, and only the second one is the
	 * one anyone cares about.
	 *
	 * This renders a real note through a real OfflineAudioContext, the same
	 * engine a played key uses, and reports the amplitude envelope. A test can
	 * then say "silent between 0.5s and 1.0s" and be talking about the sound.
	 *
	 * Not linked from anywhere: it is a tool, driven by Playwright, and its
	 * output is JSON in the DOM rather than anything to look at.
	 */
	import { onMount } from 'svelte';
	import { modularSynth } from '$lib/synth';
	import { soundEngine } from '$lib/sound';
	/* The default timbre every preset is built on, used here as the reset
	   between renders -- see `setTrack`. Same object as the catalogue's, so the
	   bench cannot drift from what a preset actually clears. */
	import { BASE, BUILTIN_KITS, SOUND_PRESETS } from '$lib/stores/synth-presets';
	/* The editing half of the canvas, so a test can draw a cable the way a
	   pointer does rather than by writing the cable into a literal graph.

	   Imported statically because there is no other way in: a dynamic import
	   inside `page.evaluate` is rewritten by Vitest's transform and arrives in
	   the browser as an undefined helper, so a test that wants `addCable` has to
	   find it already on the page. Same reason `probeValue` lives here. */
	import {
		addNode,
		addCable,
		removeNode,
		removeCable,
		setGraphParam,
		setGraphParams,
		undoGraph,
		redoGraph,
		clearGraphHistory,
		graphOf,
		isFixedNode,
		deleteSelection,
		type RackGraph,
		type GraphCable,
		type PortKind
	} from '$lib/stores/synth-graph';
	import { createResolver } from '$lib/stores/node-graph';
	import { pickTimbre, isPresetFile } from '$lib/stores/synth-presets';
	import { grandPiano } from '$lib/stores/grand-piano';

	type Result = {
		ok: boolean;
		/** Did `triggerTrackVoice` actually make a voice? */
		builtVoice?: boolean;
		error?: string;
		/** RMS per slice, loud enough to hear or not. */
		envelope: number[];
		/** Seconds each slice covers. */
		sliceSeconds: number;
		peak: number;
	};

	let result = $state<Result | null>(null);

	/**
	 * Render one held note of the patch currently on track 0.
	 *
	 * Goes through `triggerTrackVoice` inside an OfflineAudioContext that the
	 * synth has been told to use, which is exactly what the WAV export does --
	 * so what this measures is what the file would contain.
	 */
	async function renderNote(
		seconds: number,
		noteIndex: number,
		slices: number,
		holdSec?: number
	): Promise<Result> {
		const rate = 44100;
		const frames = Math.ceil(seconds * rate);
		const offline = new OfflineAudioContext(2, frames, rate);
		await ensureLiveDsp(offline);
		const S = modularSynth as unknown as {
			renderCtx: unknown;
			renderMaster: GainNode | null;
			masterFXCtx: unknown;
			initMasterFX(ctx: unknown): void;
			regenerateNoiseBuffer(): void;
			triggerTrackVoice(...a: unknown[]): unknown;
			activeVoices: Map<string, unknown>;
			clearGraphCache?(): void;
		};
		const savedCtx = S.renderCtx;
		let builtVoice = false;
		try {
			S.renderCtx = offline;
			S.renderMaster = null;
			S.masterFXCtx = null;
			S.clearGraphCache?.();
			S.activeVoices.clear();
			S.regenerateNoiseBuffer();

			/* Make the voice bus up front and tap it.

			   `masterOut` creates `renderMaster` lazily, so tapping it before the
			   voice existed found nothing -- and recording the destination instead
			   measured the master FX, whose reverb settles at a level of its own.
			   That is why every render came back with the same envelope, including
			   one with the track muted: the bench was listening to the room.

			   Everything a note makes passes through this gain. Nothing the master
			   chain generates on its own does. */
			const bus = offline.createGain();
			bus.gain.value = 1;
			S.renderMaster = bus;
			const tap = offline.createGain();
			bus.connect(tap);
			tap.connect(offline.destination);

			/* No master FX at all.

			   `initMasterFX` connects its own delay and reverb to this same bus,
			   and the reverb -- built from a generated noise impulse -- settles at
			   a level of its own that swamped every measurement: three renders of
			   different patches, and one with the track muted, all came back with
			   the same envelope because none of what I was recording was the note.

			   Skipping it means the bench hears the voice and nothing else, which
			   is what a patch test wants. The FX are a master-bus concern and have
			   their own tests. */
			/* An explicit start time, which is not optional here: during a render
			   `triggerTrackVoice` drops any call that has none, so a key pressed by
			   hand cannot be baked into an exported WAV. Held for the whole render,
			   so a gate switching twice a second has something to switch. */
			/* How long the key is held, which is not the same as how long the
			   render is.
			
			   It used to be `seconds` unconditionally, so the note always lasted
			   the whole render and nothing could ever reach its release. That hid
			   a real defect: TUBE's DCAY sets the fall *after* the key lifts, so
			   across its entire twelve-second range every render read 0.289 to
			   four decimals -- a knob the card offers that no test on this bench
			   could show working, because the bench never let go of the key. */
			const key = S.triggerTrackVoice(0, noteIndex, 0, 0.01, holdSec ?? seconds, 110, 110);
			builtVoice = key != null;

			const buf = await offline.startRendering();
			const d = buf.getChannelData(0);
			const per = Math.floor(d.length / slices);
			const envelope: number[] = [];
			let peak = 0;
			for (let s = 0; s < slices; s++) {
				let sum = 0;
				for (let i = s * per; i < (s + 1) * per; i++) {
					sum += d[i] * d[i];
					const a = Math.abs(d[i]);
					if (a > peak) peak = a;
				}
				envelope.push(Math.round(Math.sqrt(sum / per) * 10000) / 10000);
			}
			return {
				ok: true,
				builtVoice,
				envelope,
				sliceSeconds: per / rate,
				peak: Math.round(peak * 10000) / 10000
			};
		} catch (e) {
			return {
				ok: false,
				builtVoice,
				error: e instanceof Error ? e.message : String(e),
				envelope: [],
				sliceSeconds: 0,
				peak: 0
			};
		} finally {
			/* Everything the engine caches per context has to go, or the next
			   render connects last render's nodes and Web Audio refuses. This
			   mirrors `renderOffline`'s own teardown. */
			S.renderCtx = savedCtx;
			S.renderMaster = null;
			S.masterFXCtx = null;
			S.clearGraphCache?.();
			S.activeVoices.clear();
		}
	}

	/**
	 * Several timed notes of the patch on track 0, as a 16-bit stereo WAV
	 * (base64), for listening rather than measuring -- `renderNote` hears one
	 * key, and a patch meant to be played is judged on chords, runs and the way
	 * one note rings under the next.
	 *
	 * Same context setup as `renderNote`: the voice bus only, no master FX.
	 */
	async function renderPhrase(
		notes: { note: number; at: number; dur: number; vel: number }[],
		seconds: number
	): Promise<{ ok: boolean; wav?: string; peak?: number; firstNonFinite?: number; error?: string }> {
		const rate = 48000;
		const offline = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
		await ensureLiveDsp(offline);
		const S = modularSynth as unknown as {
			renderCtx: unknown;
			renderMaster: GainNode | null;
			masterFXCtx: unknown;
			regenerateNoiseBuffer(): void;
			triggerTrackVoice(...a: unknown[]): unknown;
			activeVoices: Map<string, unknown>;
			clearGraphCache?(): void;
		};
		const savedCtx = S.renderCtx;
		try {
			S.renderCtx = offline;
			S.masterFXCtx = null;
			S.clearGraphCache?.();
			S.activeVoices.clear();
			S.regenerateNoiseBuffer();
			const bus = offline.createGain();
			bus.connect(offline.destination);
			S.renderMaster = bus;
			for (const n of notes) S.triggerTrackVoice(0, n.note, 0, n.at, n.dur, n.vel, n.vel);
			const buf = await offline.startRendering();
			const l = buf.getChannelData(0);
			const r = buf.getChannelData(1);
			let peak = 0;
			let nan = -1;
			for (let i = 0; i < l.length; i++) {
				if (nan < 0 && !(Number.isFinite(l[i]) && Number.isFinite(r[i]))) nan = i / rate;
				peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
			}
			const bytes = new Uint8Array(44 + l.length * 4);
			const v = new DataView(bytes.buffer);
			const str = (o: number, s: string) => {
				for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
			};
			str(0, 'RIFF');
			v.setUint32(4, 36 + l.length * 4, true);
			str(8, 'WAVEfmt ');
			v.setUint32(16, 16, true);
			v.setUint16(20, 1, true);
			v.setUint16(22, 2, true);
			v.setUint32(24, rate, true);
			v.setUint32(28, rate * 4, true);
			v.setUint16(32, 4, true);
			v.setUint16(34, 16, true);
			str(36, 'data');
			v.setUint32(40, l.length * 4, true);
			const s16 = (x: number) => Math.round(Math.max(-1, Math.min(1, x)) * 32767);
			for (let i = 0; i < l.length; i++) {
				v.setInt16(44 + i * 4, s16(l[i]), true);
				v.setInt16(46 + i * 4, s16(r[i]), true);
			}
			let bin = '';
			for (let i = 0; i < bytes.length; i += 0x8000)
				bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
			return { ok: true, wav: btoa(bin), peak, firstNonFinite: nan };
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		} finally {
			S.renderCtx = savedCtx;
			S.renderMaster = null;
			S.masterFXCtx = null;
			S.clearGraphCache?.();
			S.activeVoices.clear();
		}
	}

	/**
	 * Keys played the way a hand plays them: each held open-ended and let go
	 * with a real key-up, through the master FX the way a live key sounds --
	 * not the bare voice bus the other renders tap. What it answers is whether
	 * playing leaves the output alive: the first non-finite sample (one NaN in
	 * a master filter's state silences everything after it), RMS per slice,
	 * and how many voices are still held once it is over.
	 */
	async function renderLive(
		events: { note: number; on: number; off: number; vel: number }[],
		seconds: number,
		slices = 20
	): Promise<{
		ok: boolean;
		envelope?: number[];
		firstNonFinite?: number;
		voicesLeft?: number;
		error?: string;
	}> {
		const rate = 48000;
		const offline = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
		await ensureLiveDsp(offline);
		const S = modularSynth as unknown as {
			renderCtx: unknown;
			renderMaster: GainNode | null;
			masterFXCtx: unknown;
			initMasterFX(ctx: unknown): void;
			regenerateNoiseBuffer(): void;
			triggerTrackVoice(...a: unknown[]): string | undefined;
			releaseTrackVoice(k: string): void;
			activeVoices: Map<string, unknown>;
			clearGraphCache?(): void;
		};
		const savedCtx = S.renderCtx;
		try {
			S.renderCtx = offline;
			S.renderMaster = null;
			S.masterFXCtx = null;
			S.clearGraphCache?.();
			S.activeVoices.clear();
			S.regenerateNoiseBuffer();
			S.initMasterFX(offline);
			const at = (t: number, fn: () => void) =>
				offline.suspend(t).then(() => {
					fn();
					void offline.resume();
				});
			const keys = new Map<number, string | undefined>();
			const times = [...new Set(events.flatMap((e) => [e.on, e.off]))].sort((a, b) => a - b);
			for (const t of times)
				void at(t, () => {
					for (const [i, e] of events.entries()) {
						if (e.off === t) {
							const k = keys.get(i);
							if (k) S.releaseTrackVoice(k);
						}
						if (e.on === t) keys.set(i, S.triggerTrackVoice(0, e.note, 0, t, 0, e.vel, e.vel));
					}
				});
			const buf = await offline.startRendering();
			const l = buf.getChannelData(0);
			const r = buf.getChannelData(1);
			let nan = -1;
			for (let i = 0; i < l.length; i++)
				if (!(Number.isFinite(l[i]) && Number.isFinite(r[i]))) {
					nan = i / rate;
					break;
				}
			const per = Math.floor(l.length / slices);
			const envelope: number[] = [];
			for (let s = 0; s < slices; s++) {
				let sum = 0;
				for (let i = s * per; i < (s + 1) * per; i++) sum += Number.isFinite(l[i]) ? l[i] * l[i] : 0;
				envelope.push(Math.round(Math.sqrt(sum / per) * 10000) / 10000);
			}
			return { ok: true, envelope, firstNonFinite: nan, voicesLeft: S.activeVoices.size };
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		} finally {
			S.renderCtx = savedCtx;
			S.renderMaster = null;
			S.masterFXCtx = null;
			S.clearGraphCache?.();
			S.activeVoices.clear();
		}
	}

	/**
	 * `renderNote`, but the key comes up mid-render rather than being held for
	 * the whole thing -- what a graph wired to REL actually needs proven.
	 *
	 * `triggerTrackVoice`'s own `holdSec` still ends the note eventually, the
	 * same as any other render; what this adds is a real `noteOff` partway
	 * through, which is the one thing REL fires on and the one thing no other
	 * bench call can produce. `suspend`/`resume` are what makes that possible
	 * offline: the render is not wall-clock time, so "call `releaseTrackVoice`
	 * after 0.4 s" cannot mean `setTimeout` here -- it means pausing the
	 * render at that offline instant, releasing the voice against `ctx` at
	 * exactly that `currentTime`, and letting the render continue from there.
	 */
	async function renderWithRelease(
		seconds: number,
		noteIndex: number,
		slices: number,
		releaseAtSec: number
	): Promise<Result> {
		const rate = 44100;
		const frames = Math.ceil(seconds * rate);
		const offline = new OfflineAudioContext(2, frames, rate);
		await ensureLiveDsp(offline);
		const S = modularSynth as unknown as {
			renderCtx: unknown;
			renderMaster: GainNode | null;
			masterFXCtx: unknown;
			initMasterFX(ctx: unknown): void;
			regenerateNoiseBuffer(): void;
			triggerTrackVoice(...a: unknown[]): unknown;
			releaseTrackVoice?(k: unknown): void;
			activeVoices: Map<string, unknown>;
			clearGraphCache?(): void;
		};
		const savedCtx = S.renderCtx;
		let builtVoice = false;
		try {
			S.renderCtx = offline;
			S.renderMaster = null;
			S.masterFXCtx = null;
			S.clearGraphCache?.();
			S.activeVoices.clear();
			S.regenerateNoiseBuffer();

			const bus = offline.createGain();
			bus.gain.value = 1;
			S.renderMaster = bus;
			const tap = offline.createGain();
			bus.connect(tap);
			tap.connect(offline.destination);

			// durationSec 0: held until released, the continuous-hold shape REL
			// exists for -- a timed note already knows its own end and does not
			// need this bench to manufacture one.
			const key = S.triggerTrackVoice(0, noteIndex, 0, 0.01, 0, 110, 110);
			builtVoice = key != null;

			if (builtVoice && releaseAtSec < seconds) {
				offline.suspend(releaseAtSec).then(() => {
					S.releaseTrackVoice?.(key);
					offline.resume();
				});
			}

			const buf = await offline.startRendering();
			const d = buf.getChannelData(0);
			const per = Math.floor(d.length / slices);
			const envelope: number[] = [];
			let peak = 0;
			for (let s = 0; s < slices; s++) {
				let sum = 0;
				for (let i = s * per; i < (s + 1) * per; i++) {
					sum += d[i] * d[i];
					const a = Math.abs(d[i]);
					if (a > peak) peak = a;
				}
				envelope.push(Math.round(Math.sqrt(sum / per) * 10000) / 10000);
			}
			return {
				ok: true,
				builtVoice,
				envelope,
				sliceSeconds: per / rate,
				peak: Math.round(peak * 10000) / 10000
			};
		} catch (e) {
			return {
				ok: false,
				builtVoice,
				error: e instanceof Error ? e.message : String(e),
				envelope: [],
				sliceSeconds: 0,
				peak: 0
			};
		} finally {
			S.renderCtx = savedCtx;
			S.renderMaster = null;
			S.masterFXCtx = null;
			S.clearGraphCache?.();
			S.activeVoices.clear();
		}
	}

	/**
	 * Two keys held on the same track, one released and one left down --
	 * proof that REL belongs to the key it fired for and not to the track.
	 *
	 * Each `triggerTrackVoice` call is its own `ActiveVoice`, keyed by its own
	 * `voiceKey`; `releaseTrackVoice` only ever touches the one key it is
	 * given. This exists to say so with a render rather than by reading the
	 * map lookup and trusting it: two notes in, one `noteOff`, and the other
	 * voice's own envelope should show nothing happened to it at all.
	 */
	async function renderTwoKeysReleaseOne(
		seconds: number,
		noteA: number,
		noteB: number,
		slices: number,
		releaseAtSec: number
	): Promise<Result> {
		const rate = 44100;
		const frames = Math.ceil(seconds * rate);
		const offline = new OfflineAudioContext(2, frames, rate);
		await ensureLiveDsp(offline);
		const S = modularSynth as unknown as {
			renderCtx: unknown;
			renderMaster: GainNode | null;
			masterFXCtx: unknown;
			regenerateNoiseBuffer(): void;
			triggerTrackVoice(...a: unknown[]): unknown;
			releaseTrackVoice?(k: unknown): void;
			activeVoices: Map<string, unknown>;
			clearGraphCache?(): void;
		};
		const savedCtx = S.renderCtx;
		let builtVoice = false;
		try {
			S.renderCtx = offline;
			S.renderMaster = null;
			S.masterFXCtx = null;
			S.clearGraphCache?.();
			S.activeVoices.clear();
			S.regenerateNoiseBuffer();

			const bus = offline.createGain();
			bus.gain.value = 1;
			S.renderMaster = bus;
			const tap = offline.createGain();
			bus.connect(tap);
			tap.connect(offline.destination);

			const keyA = S.triggerTrackVoice(0, noteA, 0, 0.01, 0, 110, 110);
			const keyB = S.triggerTrackVoice(0, noteB, 0, 0.01, 0, 110, 110);
			builtVoice = keyA != null && keyB != null;

			if (builtVoice) {
				// Only A comes up; B stays held for the whole render.
				offline.suspend(releaseAtSec).then(() => {
					S.releaseTrackVoice?.(keyA);
					offline.resume();
				});
			}

			const buf = await offline.startRendering();
			const d = buf.getChannelData(0);
			const per = Math.floor(d.length / slices);
			const envelope: number[] = [];
			let peak = 0;
			for (let s = 0; s < slices; s++) {
				let sum = 0;
				for (let i = s * per; i < (s + 1) * per; i++) {
					sum += d[i] * d[i];
					const a = Math.abs(d[i]);
					if (a > peak) peak = a;
				}
				envelope.push(Math.round(Math.sqrt(sum / per) * 10000) / 10000);
			}
			return {
				ok: true,
				builtVoice,
				envelope,
				sliceSeconds: per / rate,
				peak: Math.round(peak * 10000) / 10000
			};
		} catch (e) {
			return {
				ok: false,
				builtVoice,
				error: e instanceof Error ? e.message : String(e),
				envelope: [],
				sliceSeconds: 0,
				peak: 0
			};
		} finally {
			S.renderCtx = savedCtx;
			S.renderMaster = null;
			S.masterFXCtx = null;
			S.clearGraphCache?.();
			S.activeVoices.clear();
		}
	}

	/**
	 * A live-playback sample of the master bus, for testing anything that only
	 * fires outside a render.
	 *
	 * Voice stealing and ACT's CUT/SOLO are both guarded by `!this.renderCtx`
	 * -- polyphony limits and mute groups are a live-playing concern, and an
	 * offline render triggers explicit voices with explicit lengths rather
	 * than competing for a limited pool. ON-CHOKE fires from exactly those two
	 * places, so proving it fires means playing a real note through a real
	 * `AudioContext` and reading the master analyser some milliseconds later,
	 * the same way `probeValue` already does for a graph's own probes.
	 */
	async function playAndSample(patch: Record<string, unknown>, waitMs: number): Promise<number> {
		const S = modularSynth as unknown as {
			updateTrack(i: number, t: unknown): void;
			triggerTrackVoice(...a: unknown[]): unknown;
			stopAll(): void;
		};
		S.updateTrack(0, { graphWaves: {}, graphParams: {}, ...patch, muted: false });
		S.triggerTrackVoice(0, 48, 0);
		await new Promise((r) => setTimeout(r, waitMs));
		const an = soundEngine.getAnalyser();
		let peak = 0;
		if (an) {
			const f = new Float32Array(an.fftSize);
			an.getFloatTimeDomainData(f);
			for (const v of f) peak = Math.max(peak, Math.abs(v));
		}
		/* `stopAll`, not `releaseTrackVoice`: a graph wired to ON-CHOKE can
		   leave a tail ringing on a source no longer in `activeVoices` at all
		   (see `stopAll`'s own docstring on `ringingTails`), and this bench
		   runs many patches in one page session -- a tail with no envelope of
		   its own left playing would bleed into the very next measurement. */
		S.stopAll();
		await new Promise((r) => setTimeout(r, 60));
		return peak;
	}

	/**
	 * Note A, then note B on the same track a moment later -- what ON-CHOKE
	 * needs proven, since `noteActions`' CUT/SOLO loop only ever reaches
	 * voices already in `activeVoices` when a *later* note's own ACT fires.
	 * A note cannot choke itself: it is filed into that map only after its
	 * own CUT/SOLO decision has already been read, so testing "a voice
	 * choked from outside" means two notes, not one.
	 */
	async function playTwoAndSample(
		patch: Record<string, unknown>,
		gapMs: number,
		waitMs: number
	): Promise<number> {
		const S = modularSynth as unknown as {
			updateTrack(i: number, t: unknown): void;
			triggerTrackVoice(...a: unknown[]): unknown;
			stopAll(): void;
		};
		S.updateTrack(0, { graphWaves: {}, graphParams: {}, ...patch, muted: false });
		S.triggerTrackVoice(0, 48, 0);
		await new Promise((r) => setTimeout(r, gapMs));
		S.triggerTrackVoice(0, 55, 0);
		await new Promise((r) => setTimeout(r, waitMs));
		const an = soundEngine.getAnalyser();
		let peak = 0;
		if (an) {
			const f = new Float32Array(an.fftSize);
			an.getFloatTimeDomainData(f);
			for (const v of f) peak = Math.max(peak, Math.abs(v));
		}
		// See `playAndSample`'s comment on `stopAll` versus `releaseTrackVoice`.
		S.stopAll();
		await new Promise((r) => setTimeout(r, 60));
		return peak;
	}

	onMount(() => {
		/* Driven from outside: Playwright sets the patch, calls this, and reads
		   the JSON back out of the DOM. */
		(window as unknown as Record<string, unknown>).__audit = {
			renderNote,
			renderPhrase,
			renderLive,
			/* The worklet loader itself, so a test can drive one processor on a
			   context of its own and read its curve sample by sample. Here for the
			   same reason as `addCable`: an import inside `page.evaluate` does not
			   survive Vitest's transform. */
			liveDsp: { ensureLiveDsp, createLiveDsp },
			// The shipped presets and kits, for tests that play them as the app would.
			presets: { SOUND_PRESETS, BUILTIN_KITS },
			// The piano's builder, so it can be voiced with numbers changed and rendered.
			grandPiano,
			// The live engine itself, for driving a realtime context the way a key does.
			engine: modularSynth,
			sound: soundEngine,
			renderWithRelease,
			renderTwoKeysReleaseOne,
			playAndSample,
			playTwoAndSample,
			setTrack: (patch: Record<string, unknown>) => {
				/* Silence every other track, so what the bench records is one voice.
				   Track 0 is the one played; the rest of a loaded song would
				   otherwise sound underneath it and swamp a quiet patch. */
				const all = modularSynth.getTracks();
				for (let i = 1; i < all.length; i++) modularSynth.updateTrack(i, { muted: true } as never);
				/* Clear every field a patch might carry before writing the new one.
				
				   `updateTrack` merges -- `{...existing, ...partial}` -- so a field
				   the incoming patch omits keeps whatever the *last* patch set.
				   `graphWaves` is the one that bit: a test setting a square wave
				   left it behind, and the next test's bare oscillator rendered at
				   0.5758 instead of 0.4813 while its own patch said nothing about
				   waveforms.
				
				   That made the suite fail about one run in three, on a different
				   cluster of tests each time, depending on the order renders
				   happened to run in. Worse than flaky: a leaked field is a render
				   measuring something other than the patch under test, which is
				   exactly what this bench exists to rule out. */
				/* `advanced` is in that list for a reason the others are not: it
				   decides which of the track's two instruments renders at all, so
				   leaking it does not shade a measurement, it measures a different
				   voice. Found by a preset test -- the ADV presets carry a
				   `rackGraph` but not the flag, because `applyPresetAt` derives it
				   from the graph rather than storing it, and a preset rendered
				   without it goes through the subtractive voice instead. Measured
				   in a file of its own, three of the eight then read peak 0.0000
				   with a built voice and no error; in a file where any earlier test
				   had set the flag, the same renders sounded fine. A defect that
				   depends on what ran before it is the flake this reset list exists
				   to prevent, and this was the one field missing from it. */
				/* The list is `BASE` now rather than five names, because a hand-kept
				   list of what to clear is a list that falls behind and this one had
				   twice: `graphWaves`, then `advanced`, each found only when a
				   measurement went wrong in a way that depended on test order.

				   `BASE` is the catalogue's own "a preset is the whole sound"
				   object -- the 47 subtractive fields every shipped preset sets so
				   that a patch does not inherit the last one's LFO, noise mix or
				   filter envelope. The bench needs exactly the same guarantee for
				   exactly the same reason, so it uses the same object rather than a
				   second copy that can drift from it.

				   Found by the FREQ tests in `ports.test.ts`, which are the first in
				   that file to run *after* the ADV preset block and assert tight
				   constants. Those presets carry all 47 fields; five were cleared
				   and 42 leaked. A bare oscillator that reads 0.4813 on a clean
				   bench read 0.5570 after KOTO and 0.1731 by the end of the file --
				   so ten tests failed in the suite and passed in isolation, which is
				   the worst shape a failure can have. `presetGain` and `cutoff` are
				   the two doing most of it, and neither could have been guessed from
				   the five that were already here. */
				modularSynth.updateTrack(0, {
					...BASE,
					graphWaves: {},
					graphParams: {},
					rackChain: [],
					rackParams: {},
					advanced: false,
					...patch,
					muted: false
				} as never);
				/* Read it straight back, so a caller can tell whether the write
				   landed rather than assuming. A graph the engine did not take is
				   the difference between measuring a patch and measuring the last
				   one. */
				const t = modularSynth.getTrack(0) as unknown as Record<string, unknown>;
				return {
					advanced: t?.advanced,
					nodes: (t?.rackGraph as { nodes?: unknown[] })?.nodes?.length ?? 0,
					params: Object.keys((t?.graphParams ?? {}) as object).length,
					level: (t?.graphParams as Record<string, number>)?.['gain-mtwflybt-1.level']
				};
			},
			/* What a probe's analyser is carrying, live.
			
			   Here rather than in the test, because a dynamic import inside
			   page.evaluate is rewritten by Vitest's own transform and does not
			   survive the trip into the browser. The page already holds the
			   engine, so it does the reading and hands back a number.
			
			   Read as a float: the byte view saturates at +/-1, so a control value
			   of 3 and one of 5000 are the same byte and the reading would be a
			   lie for every range above unity. */
			probeValue: async (patch: Record<string, unknown>, nodeId: string, holdMs = 200) => {
				const S = modularSynth as unknown as {
					updateTrack(i: number, t: unknown): void;
					triggerTrackVoice(...a: unknown[]): unknown;
					releaseTrackVoice?(k: unknown): void;
					graphProbes: Map<string, AnalyserNode>;
				};
				/* The same clearing `setTrack` does, for the same reason: `updateTrack`
				   merges, so a field this patch omits would keep whatever the last
				   one set. Not known to have bitten here -- a bare oscillator
				   measures 0.4813 either side of a patch carrying a waveform -- but
				   it is the identical unguarded merge on the same shared track, and
				   the version in `setTrack` was not known to have bitten either
				   until it made a third of the suite fail. */
				S.updateTrack(0, { graphWaves: {}, graphParams: {}, ...patch, muted: false });
				const key = S.triggerTrackVoice(0, 48, 0);
				await new Promise((r) => setTimeout(r, holdMs));
				const an = S.graphProbes.get(nodeId);
				let out: number | null = null;
				if (an) {
					const f = new Float32Array(an.fftSize);
					an.getFloatTimeDomainData(f);
					out = f[f.length - 1];
				}
				if (key) S.releaseTrackVoice?.(key);
				await new Promise((r) => setTimeout(r, 60));
				return out;
			},
			/* What a patch's white cable decides to do to the notes already
			   sounding: CUT, SOLO, which group, how fast.

			   Here rather than in a render, because an action is not a sound. ACT
			   reaches sideways at other voices, and the bench plays exactly one
			   note into a fresh context -- so there is nothing for a choke to act
			   on and an offline envelope cannot see it at all. What can be
			   measured is the decision, which is what `noteActions` returns.

			   It walks the exec wire a second time, separately from `execReach`,
			   and the two have disagreed before: the walk was hardcoded as ENTRY
			   -> WHEN -> ACT, exactly two hops, so a WAIT anywhere in the chain
			   silently dropped the rest of it while the audio side traversed it
			   correctly. */
			noteActions: (patch: Record<string, unknown>, noteIndex = 40, velocity = 110 / 127) => {
				const S = modularSynth as unknown as {
					updateTrack(i: number, t: unknown): void;
					getTrack(i: number): unknown;
					noteActions(t: unknown, n: number, id: number, e: unknown): unknown;
				};
				/* The same clearing `setTrack` does, for the same reason: `updateTrack`
				   merges, so a field this patch omits would keep whatever the last
				   one set. Not known to have bitten here -- a bare oscillator
				   measures 0.4813 either side of a patch carrying a waveform -- but
				   it is the identical unguarded merge on the same shared track, and
				   the version in `setTrack` was not known to have bitten either
				   until it made a third of the suite fail. */
				S.updateTrack(0, { graphWaves: {}, graphParams: {}, ...patch, muted: false });
				/* The same event the sound is built from: semitones from the tuning
				   reference and the real velocity, not a second literal. Two copies
				   of "what this note is" are what let the choke and the sound answer
				   a CMP on VEL differently. */
				return S.noteActions(S.getTrack(0), noteIndex, 0, {
					velocity,
					pitch: noteIndex - 69
				});
			},
			run: async (seconds = 2, noteIndex = 40, slices = 8, holdSec?: number) => {
				result = await renderNote(seconds, noteIndex, slices, holdSec);
				return result;
			},
			/* The canvas's own editing functions, driven as the pointer drives
			   them: against the *live* track, through the undo stack, with the
			   graph read back out afterwards.

			   A test could write the finished graph into a literal instead, and
			   the audio suite mostly does -- but then what is measured is the
			   engine, and everything between the pointer and the patch (cable
			   legality, MAP's inferred range, what a delete takes with it, what
			   an undo puts back) is never executed at all. These go through the
			   same doors the editor uses, so the graph they leave behind is the
			   one a player would have built. */
			edit: {
				/** The live track's graph, as the editor reads it. */
				graph: () => graphOf(modularSynth.getTrack(0)) as RackGraph,
				/** The live track's knob settings. */
				params: () =>
					(modularSynth.getTrack(0)?.graphParams ?? {}) as Record<string, number>,
				addNode: (type: string, x = 0, y = 0) => addNode(graphOf(modularSynth.getTrack(0)), type, x, y),
				addCable: (cable: GraphCable, kind: PortKind) =>
					addCable(graphOf(modularSynth.getTrack(0)), cable, kind),
				removeCable: (i: number) => removeCable(graphOf(modularSynth.getTrack(0)), i),
				removeNode: (id: string) =>
					removeNode(
						graphOf(modularSynth.getTrack(0)),
						id,
						modularSynth.getTrack(0)?.graphParams as Record<string, number>
					),
				deleteSelection: (ids: string[]) =>
					deleteSelection(
						graphOf(modularSynth.getTrack(0)),
						new Set(ids),
						modularSynth.getTrack(0)?.graphParams as Record<string, number>
					),
				setParam: (nodeId: string, param: string, value: number) =>
					setGraphParam(
						modularSynth.getTrack(0)?.graphParams as Record<string, number>,
						nodeId,
						param,
						value
					),
				setParams: (values: Record<string, number>) =>
					setGraphParams(
						modularSynth.getTrack(0)?.graphParams as Record<string, number>,
						values
					),
				undo: () => undoGraph(),
				redo: () => redoGraph(),
				clearHistory: () => clearGraphHistory(),
				isFixedNode: (id: string) => isFixedNode(graphOf(modularSynth.getTrack(0)), id)
			},
			/* Does a signal land on this inlet, asked of a whole patch?

			   `isDrivenBySignal` is what decides whether a knob is taken over or
			   added to, and its answer is a property of the patch rather than of
			   the module -- MAP hands out a signal exactly when one went in --
			   so it is asked here, of a resolver built the way the engine builds
			   one. */
			drivenBy: (patch: Record<string, unknown>, nodeId: string, port: string) => {
				const g = graphOf(patch as { rackGraph?: RackGraph });
				const r = createResolver(g, (patch.graphParams ?? {}) as Record<string, number>, {
					pitch: 0,
					velocity: 1,
					noteIndex: 40,
					lanes: {}
				});
				return { signal: r.isDrivenBySignal(nodeId, port), wired: r.isWired(nodeId, port) };
			},
			/* A round trip through the preset format, in memory.

			   `exportActivePreset` builds this same object and hands it to a
			   download; the file is the only part a test cannot follow. What is
			   worth measuring is whether the patch survives `pickTimbre` and the
			   JSON, which is the half that has silently dropped the rack before. */
			exportTimbre: (format = 'krsz-synth-preset') => {
				const file = {
					format,
					version: 1,
					name: 'ROUNDTRIP',
					timbre: pickTimbre(modularSynth.getTrack(0) as unknown as Record<string, unknown>)
				};
				/* Through the JSON, not around it. A structured clone would carry
				   things a file cannot -- and what is being asked is whether the
				   patch survives being written down and read back. */
				const text = JSON.stringify(file, null, 2);
				return { text, valid: isPresetFile(JSON.parse(text)) };
			}
		};
	});
</script>

<main class="p-4 font-mono text-xs text-white bg-black min-h-screen">
	<h1 class="font-bold mb-2">PATCH AUDIT</h1>
	<p class="opacity-60 mb-3">
		Renders one held note of track 1 offline and reports its amplitude envelope. Driven from
		outside; nothing to click.
	</p>
	<pre data-audit-result>{result ? JSON.stringify(result, null, 2) : 'idle'}</pre>
</main>
