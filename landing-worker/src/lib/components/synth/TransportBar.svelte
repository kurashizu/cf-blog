<script lang="ts">
	import { t } from '$lib/i18n';
	import { playSound } from '../../sound';
	import { setMuted } from '../../stores/sound';
	import {
		MAX_GRID_STEPS,
		METER_SPECS,
		type TimeSignature,
		type NoteDurationDiv
	} from '../../synth';
	import { isSynthSettingsOpen } from '../../stores/synth-settings';
	import { get } from 'svelte/store';
	import {
		canOverwritePreset,
		openPresetSaveAs,
		saveActivePreset
	} from '../../stores/synth-presets';
	import {
		bpm,
		setBpm,
		timeMeter,
		setTimeMeter,
		totalPatternSteps,
		setTotalPatternSteps,
		snapDiv,
		setSnapDiv,
		noteDur,
		setNoteDur,
		activeStepPage,
		pageInputStr,
		prevPatternPage,
		nextPatternPage,
		pageFollow,
		cursorStep,
		isSeqPlaying,
		toggle,
		rewindToStart,
		stepBar,
		jumpPlayheadToCursor,
		loopMode,
		setLoopMode,
		activeTrackId
	} from '../../stores/synth-transport';
	import { tracksState, toggleTrackMute, toggleTrackSolo } from '../../stores/synth-tracks';
	import { suspendNavHotkeys } from '../../stores/hotkeys';
	import { stepPreset } from '../../stores/synth-presets';
	import { hotkeyOverlayOpen, consoleOverlayOpen } from '../../stores/chrome';
	import PatchManager from './PatchManager.svelte';
	import PresetMenu from './PresetMenu.svelte';
	import TrackChips from './TrackChips.svelte';
	import HorizontalHardwareFader from '../hardware/HorizontalHardwareFader.svelte';

	const METERS: TimeSignature[] = ['4/4', '3/4', '2/4', '5/4', '6/8', '7/8'];
	const DIVS: NoteDurationDiv[] = ['4', '2', '1', '1/2', '1/3', '1/4', '1/6', '1/8', '1/12'];
	// Pattern length is edited in PAGES (one page = one bar) — the step count
	// follows the current METER, so the number stays human-sized (40, not 3840).
	const LEN_PAGE_PRESETS = [1, 2, 4, 8, 16, 32];

	let stepsPerBarNow = $derived((METER_SPECS[$timeMeter] || METER_SPECS['4/4']).stepsPerBar);
	let lenPages = $derived(Math.max(1, Math.ceil($totalPatternSteps / stepsPerBarNow)));
	let maxLenPages = $derived(Math.floor(MAX_GRID_STEPS / stepsPerBarNow));
	let lenIsCustom = $derived(!LEN_PAGE_PRESETS.includes(lenPages));

	/* METER was six buttons wide for a control that is set once and rarely
	   touched, which is a lot of the row spent on it. Cycled instead: the
	   arrows step through the list and the label names where you are. Every
	   signature is still reachable, in fewer pixels. */
	function stepMeter(dir: number) {
		const i = METERS.indexOf($timeMeter);
		const next = METERS[(i + dir + METERS.length) % METERS.length];
		setTimeMeter(next);
		playSound('click');
	}

	function cycleLen() {
		const currentIdx = LEN_PAGE_PRESETS.indexOf(lenPages);
		const next =
			currentIdx >= 0 && currentIdx < LEN_PAGE_PRESETS.length - 1
				? LEN_PAGE_PRESETS[currentIdx + 1]
				: LEN_PAGE_PRESETS[0];
		setTotalPatternSteps(next * stepsPerBarNow);
		playSound('click');
	}

	function onLenInput(e: Event) {
		const raw = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
		const val = parseInt(raw, 10);
		if (!isNaN(val) && val >= 1) {
			setTotalPatternSteps(Math.min(maxLenPages, val) * stepsPerBarNow);
		}
	}

	function onLenBlur(e: Event) {
		if (!$totalPatternSteps || $totalPatternSteps < stepsPerBarNow)
			setTotalPatternSteps(stepsPerBarNow);
		(e.target as HTMLInputElement).value = String(lenPages);
	}

	/*
	 * Transport hotkeys. The piano roll's editor listens in the capture phase
	 * and marks what it took with preventDefault, so Backspace and the arrows
	 * only land here when nothing is selected. Ctrl/Cmd combos are the
	 * editor's (and the site's Ctrl+digit navigation); Alt is left alone.
	 * While the QWERTY piano is on it owns the letter rows, the digit row,
	 * Space (sustain) and , . -- those keys are transport keys only when it is
	 * off, which `suspendNavHotkeys` reports.
	 */
	/**
	 * Ctrl/Cmd+S saves the patch, and Shift saves it as a new one.
	 *
	 * A separate handler because the transport's own bails out on Ctrl and Cmd
	 * -- those belong to the editor and to the site's Ctrl+digit navigation --
	 * and this is the one exception.
	 *
	 * `preventDefault` is the point of it: without that the browser offers to
	 * save the page as a file, which is never what Ctrl+S means inside an
	 * instrument. Taken even when the shortcut cannot act, so a built-in patch
	 * does not fall through to the download dialog; SAVE AS opens instead,
	 * which is the way out the menu offers too.
	 */
	function onSaveHotkey(e: KeyboardEvent) {
		if (e.defaultPrevented || e.altKey) return;
		if (!(e.ctrlKey || e.metaKey)) return;
		if (e.key !== 's' && e.key !== 'S') return;
		const target = e.target as HTMLElement | null;
		const tag = target?.tagName?.toLowerCase() ?? '';
		// A field being typed into keeps its own Ctrl+S, if it has one.
		if (['input', 'textarea', 'select'].includes(tag) || target?.isContentEditable) return;
		e.preventDefault();
		if (e.shiftKey || !get(canOverwritePreset)) openPresetSaveAs();
		else saveActivePreset();
	}

	function onTransportHotkey(e: KeyboardEvent) {
		if (e.defaultPrevented) return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if ($hotkeyOverlayOpen || $consoleOverlayOpen || $isSynthSettingsOpen) return;
		const target = e.target as HTMLElement | null;
		const tag = target?.tagName?.toLowerCase() ?? '';
		if (['input', 'textarea', 'select'].includes(tag) || target?.isContentEditable) return;
		// A focused button already fires on Enter / Space; don't also toggle the transport.
		if ((e.key === 'Enter' || e.key === ' ') && (tag === 'button' || tag === 'a')) return;
		const qwerty = $suspendNavHotkeys;

		if (e.shiftKey) {
			if (e.key === 'ArrowLeft') stepBar(-1);
			else if (e.key === 'ArrowRight') stepBar(1);
			else return;
			playSound('click');
			e.preventDefault();
			return;
		}

		switch (e.key) {
			case ' ':
				if (qwerty) return;
				togglePlayback();
				break;
			case 'Enter':
				togglePlayback();
				break;
			case 'Home':
				rewindToStart();
				playSound('click');
				break;
			case 'Backspace':
				if ($isSeqPlaying) toggle();
				rewindToStart();
				playSound('click');
				break;
			case 'ArrowLeft':
				prevPatternPage();
				break;
			case 'ArrowRight':
				nextPatternPage();
				break;
			case 'ArrowUp':
				stepPreset(1);
				break;
			case 'ArrowDown':
				stepPreset(-1);
				break;
			case '-':
				setBpm(Math.max(40, $bpm - 1));
				break;
			case '=':
				setBpm(Math.min(240, $bpm + 1));
				break;
			default: {
				if (qwerty) return;
				switch (e.key.toLowerCase()) {
					case 'm':
						toggleTrackMute($activeTrackId);
						break;
					case 's':
						toggleTrackSolo($activeTrackId);
						break;
					case 'l':
						setLoopMode(!$loopMode);
						break;
					case 'f':
						pageFollow.update((v) => !v);
						break;
					case ',':
						stepBar(-1);
						break;
					case '.':
						stepBar(1);
						break;
					default: {
						const n = Number(e.key);
						if (!(n >= 1 && n <= 8) || !$tracksState[n - 1]) return;
						activeTrackId.set(n - 1);
					}
				}
				playSound('click');
			}
		}
		e.preventDefault();
	}

	function togglePlayback() {
		if (!$isSeqPlaying) setMuted(false);
		toggle();
		playSound('click');
	}

	let cursorPosition = $derived.by(() => {
		const meterSpec = METER_SPECS[$timeMeter] || METER_SPECS['4/4'];
		const stepsPerBar = meterSpec.stepsPerBar || 96;
		const stepsPerBeat = stepsPerBar / (meterSpec.beatsPerBar || 4);
		const bar = Math.floor($cursorStep / stepsPerBar) + 1;
		const beat = Math.floor(($cursorStep % stepsPerBar) / stepsPerBeat) + 1;
		return { bar, beat };
	});
</script>

<svelte:window
	onkeydown={(e) => {
		onSaveHotkey(e);
		onTransportHotkey(e);
	}}
/>

<!-- Row 1: logo/project management + BPM/LEN/METER -->
<div
	class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-1 bg-black/40 px-2 py-1.5 rounded-xs shrink-0"
>
	<PatchManager />

	<div class="flex flex-wrap items-center gap-1.5 text-xs ml-auto">
		<div class="flex items-center gap-1">
			<HorizontalHardwareFader
				label="BPM:"
				value={$bpm}
				min={40}
				max={240}
				step={1}
				width={74}
				showValue
				color="#98c379"
				reset={120}
				onChange={setBpm}
			/>
		</div>

		<div class="w-px h-4 bg-white/15 mx-1"></div>

		<div class="flex items-center gap-1">
			<span class="opacity-60 font-bold" title={$t('synth.transport.lenHint')}>LEN:</span>
			<button
				onclick={cycleLen}
				class="px-2 py-0.5 border border-[#98c379]/50 text-[#98c379] hover:bg-[#98c379]/20 rounded-xs font-bold font-mono cursor-pointer transition-colors flex items-center gap-1"
				title={$t('synth.transport.lenCycleHint')}
			>
				<span>{LEN_PAGE_PRESETS.includes(lenPages) ? lenPages : LEN_PAGE_PRESETS[0]}</span>
				<span class="text-[10px] opacity-70">⟳</span>
			</button>
			<span class="text-white/40 text-[10px] font-bold px-0.5 select-none"
				>{$t('synth.transport.or')}</span
			>
			<input
				type="text"
				inputmode="numeric"
				value={lenPages}
				oninput={onLenInput}
				onblur={onLenBlur}
				class="w-10 px-1 py-0.5 text-center text-xs font-mono font-bold bg-black/60 border rounded-xs outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none {lenIsCustom
					? 'border-[#98c379] text-[#98c379]'
					: 'border-white/20 text-white/70 focus:border-white/60'}"
				title={$t('synth.transport.lenInputHint', {
					pages: lenPages,
					steps: stepsPerBarNow,
					meter: $timeMeter,
					total: $totalPatternSteps
				})}
			/>
			<span
				class="text-white/40 text-[10px] font-bold select-none"
				title={$t('synth.transport.lenPagesHint', {
					pages: lenPages,
					steps: stepsPerBarNow,
					meter: $timeMeter,
					total: $totalPatternSteps
				})}>PGS</span
			>
		</div>

		<div class="w-px h-4 bg-white/15 mx-1"></div>

		<div class="flex items-center gap-1">
			<span class="opacity-70 font-bold" title={$t('synth.transport.meterHint')}>METER:</span>
			<button
				onclick={() => stepMeter(-1)}
				class="px-1 text-[#c678dd] hover:text-white cursor-pointer font-bold select-none"
				title={$t('synth.transport.meterPrevHint')}>◄</button
			>
			<button
				onclick={() => stepMeter(1)}
				class="px-1.5 py-0.5 border border-[#c678dd]/50 hover:border-[#c678dd] bg-[#c678dd]/10 hover:bg-[#c678dd]/20 rounded-xs font-black text-[#c678dd] hover:text-white cursor-pointer transition-colors min-w-[3.2rem] text-center"
				title={METER_SPECS[$timeMeter].name}
			>
				{$timeMeter}
			</button>
			<button
				onclick={() => stepMeter(1)}
				class="px-1 text-[#c678dd] hover:text-white cursor-pointer font-bold select-none"
				title={$t('synth.transport.meterNextHint')}>►</button
			>
		</div>
		<div class="w-px h-3.5 bg-white/15 mx-0.5 shrink-0"></div>
		<button
			onclick={() => {
				isSynthSettingsOpen.set(true);
				playSound('click');
			}}
			class="px-2 py-0.5 border border-[#e5c07b]/50 hover:border-[#e5c07b] bg-[#e5c07b]/10 hover:bg-[#e5c07b]/20 text-[#e5c07b] hover:text-white rounded-xs font-black text-xs cursor-pointer transition-all flex items-center gap-1 shrink-0"
			title={$t('synth.transport.settingsHint')}
		>
			<span>⚙</span>
			<span>{$t('synth.transport.settings')}</span>
		</button>
	</div>
</div>

<!-- Row 2: transport playback + track chips -->
<div
	class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-1 bg-black/30 px-2 py-1 rounded-xs text-xs shrink-0"
>
	<div class="flex items-center gap-1">
		<button
			onclick={() => {
				rewindToStart();
				playSound('click');
			}}
			class="h-6 px-1.5 border border-white/20 hover:border-white/60 text-white/70 hover:text-white rounded-xs font-bold transition-colors cursor-pointer text-xs flex items-center justify-center"
			title={$t('synth.transport.rewindHint')}
		>
			<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
				<rect x="2" y="2.5" width="2" height="11" rx="0.5" />
				<polygon points="14,2.5 5,8 14,13.5" />
			</svg>
		</button>

		<button
			onclick={() => {
				stepBar(-1);
				playSound('click');
			}}
			class="h-6 px-1.5 border border-white/20 hover:border-white/60 text-white/70 hover:text-white rounded-xs font-bold transition-colors cursor-pointer text-xs flex items-center justify-center"
			title={$t('synth.transport.stepBackHint')}
		>
			<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
				<polygon points="8,2.5 2,8 8,13.5" />
				<polygon points="14,2.5 8,8 14,13.5" />
			</svg>
		</button>

		<button
			onclick={togglePlayback}
			title={$t('synth.transport.playToggleHint')}
			class="h-6 px-3 rounded-xs font-black text-xs cursor-pointer transition-all flex items-center justify-center {$isSeqPlaying
				? 'bg-[#e06c75] text-black shadow-[0_0_8px_#e06c75]'
				: 'bg-[#98c379] text-black hover:opacity-90'}"
		>
			<span>{$isSeqPlaying ? '■ STOP' : '► PLAY'}</span>
		</button>

		<button
			onclick={() => {
				stepBar(1);
				playSound('click');
			}}
			class="h-6 px-1.5 border border-white/20 hover:border-white/60 text-white/70 hover:text-white rounded-xs font-bold transition-colors cursor-pointer text-xs flex items-center justify-center"
			title={$t('synth.transport.stepFwdHint')}
		>
			<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
				<polygon points="8,2.5 14,8 8,13.5" />
				<polygon points="2,2.5 8,8 2,13.5" />
			</svg>
		</button>

		<!-- LOOP repeats the pattern; ONCE plays it through, lets the last
		     notes ring out and rewinds to bar 1. -->
		<button
			onclick={() => {
				setLoopMode(!$loopMode);
				playSound('toggle');
			}}
			class="h-6 w-6 border rounded-xs font-bold transition-colors cursor-pointer text-xs flex items-center justify-center shrink-0 {$loopMode
				? 'border-[#98c379]/60 bg-[#98c379]/15 text-[#98c379] hover:bg-[#98c379]/25'
				: 'border-[#e5c07b]/60 bg-[#e5c07b]/15 text-[#e5c07b] hover:bg-[#e5c07b]/25'}"
			title={$loopMode ? $t('synth.transport.loopOnHint') : $t('synth.transport.loopOffHint')}
			aria-label={$loopMode ? $t('synth.transport.loopOnHint') : $t('synth.transport.loopOffHint')}
		>
			<!-- The glyph is the label: a cycle repeats, an arrow runs off the
			     end. Colour separates the two states as well, and the tooltip
			     says which is which in full. -->
			<span>{$loopMode ? '⟲' : '→'}</span>
		</button>

		<button
			onclick={() => {
				jumpPlayheadToCursor();
				playSound('click');
			}}
			class="h-6 px-2 border border-[#56b6c2]/40 hover:border-[#56b6c2] text-[#56b6c2] hover:bg-[#56b6c2]/10 rounded-xs font-bold transition-colors cursor-pointer text-xs flex items-center gap-1 shrink-0"
			title={$t('synth.transport.jumpToCursorHint', {
				bar: cursorPosition.bar,
				beat: cursorPosition.beat,
				step: $cursorStep + 1,
				total: $totalPatternSteps
			})}
			aria-label={$t('synth.transport.jumpToCursorHint', {
				bar: cursorPosition.bar,
				beat: cursorPosition.beat,
				step: $cursorStep + 1,
				total: $totalPatternSteps
			})}
		>
			<!-- The glyph is the label. "CUR:" was 54px of a 128px button -- 42% of it
			     spent on a word the arrow already says -- and the raw step number
			     beside the bar.beat duplicated what the tooltip states exactly. -->
			<span>⤹</span>
			<span class="font-mono font-black">{cursorPosition.bar}.{cursorPosition.beat}</span>
		</button>
	</div>

	<TrackChips />
</div>

<!-- Row 3: sound presets, snap/dur, page nav — flex-wrap so the 9-division
     SNAP/DUR groups wrap instead of overlapping the page controls -->
<div
	class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-white/10 pb-1 bg-black/25 px-2 py-1 rounded-xs text-xs shrink-0"
>
	<PresetMenu />

	<div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
		<div class="flex items-center gap-1">
			<span class="opacity-60 font-bold" title={$t('synth.transport.snapHint')}>SNAP:</span>
			{#each DIVS as d (d)}
				<button
					onclick={() => {
						setSnapDiv(d);
						playSound('click');
					}}
					class="px-1.5 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors {$snapDiv ===
					d
						? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black'
						: 'border-white/20 text-white/70 hover:border-white/50'}"
				>
					{d}
				</button>
			{/each}
		</div>

		<div class="flex items-center gap-1 border-l border-white/15 pl-1.5">
			<span class="opacity-60 font-bold" title={$t('synth.transport.durHint')}>DUR:</span>
			{#each DIVS as d (d)}
				<button
					onclick={() => {
						setNoteDur(d);
						playSound('click');
					}}
					class="px-1.5 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors {$noteDur ===
					d
						? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black'
						: 'border-white/20 text-white/70 hover:border-white/50'}"
				>
					{d}
				</button>
			{/each}
		</div>
	</div>
</div>
