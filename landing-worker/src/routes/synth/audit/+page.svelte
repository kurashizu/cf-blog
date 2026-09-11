<script lang="ts">
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
	async function renderNote(seconds: number, noteIndex: number, slices: number): Promise<Result> {
		const rate = 44100;
		const frames = Math.ceil(seconds * rate);
		const offline = new OfflineAudioContext(2, frames, rate);
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
			const key = S.triggerTrackVoice(0, noteIndex, 0, 0.01, seconds, 110, 110);
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

	onMount(() => {
		/* Driven from outside: Playwright sets the patch, calls this, and reads
		   the JSON back out of the DOM. */
		(window as unknown as Record<string, unknown>).__audit = {
			renderNote,
			setTrack: (patch: Record<string, unknown>) => {
				/* Silence every other track, so what the bench records is one voice.
				   Track 0 is the one played; the rest of a loaded song would
				   otherwise sound underneath it and swamp a quiet patch. */
				const all = modularSynth.getTracks();
				for (let i = 1; i < all.length; i++) modularSynth.updateTrack(i, { muted: true } as never);
				modularSynth.updateTrack(0, { ...patch, muted: false } as never);
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
			run: async (seconds = 2, noteIndex = 40, slices = 8) => {
				result = await renderNote(seconds, noteIndex, slices);
				return result;
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
