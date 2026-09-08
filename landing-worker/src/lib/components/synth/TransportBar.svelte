<script lang="ts">
	import { t } from '$lib/i18n';
	import { playSound } from '../../sound';
	import { setMuted } from '../../stores/sound';
	import { MAX_GRID_STEPS, METER_SPECS, type TimeSignature, type NoteDurationDiv } from '../../synth';
	import { isSynthSettingsOpen } from '../../stores/synth-settings';
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
	import { Button } from '$lib/components/ui';

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
		const next = currentIdx >= 0 && currentIdx < LEN_PAGE_PRESETS.length - 1 ? LEN_PAGE_PRESETS[currentIdx + 1] : LEN_PAGE_PRESETS[0];
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
		if (!$totalPatternSteps || $totalPatternSteps < stepsPerBarNow) setTotalPatternSteps(stepsPerBarNow);
		(e.target as HTMLInputElement).value = String(lenPages);
	}

	let totalPages = $derived(Math.max(1, Math.ceil($totalPatternSteps / ((METER_SPECS[$timeMeter] || METER_SPECS['4/4']).stepsPerBar))));

	function prevPage() {
		const nextP = Math.max(0, $activeStepPage - 1);
		activeStepPage.set(nextP);
		pageInputStr.set(String(nextP + 1));
		playSound('click');
	}
	function nextPage() {
		const nextP = Math.min(totalPages - 1, $activeStepPage + 1);
		activeStepPage.set(nextP);
		pageInputStr.set(String(nextP + 1));
		playSound('click');
	}
	function onPageInput(e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		if (raw === '') {
			pageInputStr.set('');
			return;
		}
		const digits = raw.replace(/\D/g, '');
		if (digits === '') {
			pageInputStr.set('');
			return;
		}
		const num = parseInt(digits, 10);
		const clamped = Math.max(1, Math.min(totalPages, num));
		pageInputStr.set(digits);
		activeStepPage.set(clamped - 1);
	}
	function onPageBlur() {
		const parsed = parseInt($pageInputStr, 10);
		if ($pageInputStr === '' || isNaN(parsed)) {
			pageInputStr.set(String($activeStepPage + 1));
		} else {
			const clamped = Math.max(1, Math.min(totalPages, parsed));
			pageInputStr.set(String(clamped));
			activeStepPage.set(clamped - 1);
		}
	}
	function onPageKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			(e.target as HTMLInputElement).blur();
			playSound('click');
		}
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
			case 'Enter': togglePlayback(); break;
			case 'Home': rewindToStart(); playSound('click'); break;
			case 'Backspace':
				if ($isSeqPlaying) toggle();
				rewindToStart();
				playSound('click');
				break;
			case 'ArrowLeft': prevPage(); break;
			case 'ArrowRight': nextPage(); break;
			case 'ArrowUp': stepPreset(1); break;
			case 'ArrowDown': stepPreset(-1); break;
			case '-': setBpm(Math.max(40, $bpm - 1)); break;
			case '=': setBpm(Math.min(240, $bpm + 1)); break;
			default: {
				if (qwerty) return;
				switch (e.key.toLowerCase()) {
					case 'm': toggleTrackMute($activeTrackId); break;
					case 's': toggleTrackSolo($activeTrackId); break;
					case 'l': setLoopMode(!$loopMode); break;
					case 'f': pageFollow.update((v) => !v); break;
					case ',': stepBar(-1); break;
					case '.': stepBar(1); break;
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

<svelte:window onkeydown={onTransportHotkey} />

<!-- Row 1: logo/project management + BPM/LEN/METER -->
<div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-1 bg-black/40 px-2 py-1.5 rounded-xs shrink-0">
	<PatchManager />

	<div class="flex flex-wrap items-center gap-1.5 text-xs ml-auto">
		<div class="flex items-center gap-1">
			<HorizontalHardwareFader label="BPM:" value={$bpm} min={40} max={240} step={1} width={74} showValue color="#98c379" reset={120} onChange={setBpm} />
		</div>

		<div class="w-px h-4 bg-white/15 mx-1"></div>

		<div class="flex items-center gap-1">
			<span class="opacity-60 font-bold" title={$t('synth.transport.lenHint')}>LEN:</span>
			<Button variant="outline" color="#98c379" size="xs" onclick={cycleLen} class="font-mono flex items-center gap-1" title={$t('synth.transport.lenCycleHint')}>
				<span>{LEN_PAGE_PRESETS.includes(lenPages) ? lenPages : LEN_PAGE_PRESETS[0]}</span>
				<span class="text-[10px] opacity-70">⟳</span>
			</Button>
			<span class="text-white/60 text-[10px] font-bold px-0.5 select-none">{$t('synth.transport.or')}</span>
			<input
				type="text"
				inputmode="numeric"
				value={lenPages}
				oninput={onLenInput}
				onblur={onLenBlur}
				aria-label={$t('synth.transport.lenInputAria')}
				class="w-10 px-1 py-0.5 text-center text-xs font-mono font-bold bg-black/60 border rounded-xs outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none {lenIsCustom
					? 'border-[#98c379] text-[#98c379]'
					: 'border-white/20 text-white/70 focus:border-white/60'}"
				title={$t('synth.transport.lenInputHint', { pages: lenPages, steps: stepsPerBarNow, meter: $timeMeter, total: $totalPatternSteps })}
			/>
			<span class="text-white/60 text-[10px] font-bold select-none" title={$t('synth.transport.lenPagesHint', { pages: lenPages, steps: stepsPerBarNow, meter: $timeMeter, total: $totalPatternSteps })}>PGS</span>
		</div>

		<div class="w-px h-4 bg-white/15 mx-1"></div>

		<div class="flex items-center gap-1">
			<span class="opacity-70 font-bold" title={$t('synth.transport.meterHint')}>METER:</span>
			<Button variant="ghost" color="#c678dd" onclick={() => stepMeter(-1)} label={$t('synth.transport.meterPrevHint')} title={$t('synth.transport.meterPrevHint')} class="min-w-[24px] min-h-[24px] px-1 font-bold select-none">◄</Button>
			<Button
				variant="outline"
				color="#c678dd"
				onclick={() => stepMeter(1)}
				class="font-black min-w-[3.2rem] text-center"
				title={METER_SPECS[$timeMeter].name}
			>
				{$timeMeter}
			</Button>
			<Button variant="ghost" color="#c678dd" onclick={() => stepMeter(1)} label={$t('synth.transport.meterNextHint')} title={$t('synth.transport.meterNextHint')} class="min-w-[24px] min-h-[24px] px-1 font-bold select-none">►</Button>
		</div>
		<div class="w-px h-3.5 bg-white/15 mx-0.5 shrink-0"></div>
		<Button
			variant="outline"
			color="#e5c07b"
			onclick={() => isSynthSettingsOpen.set(true)}
			class="font-black flex items-center gap-1 shrink-0"
			title={$t('synth.transport.settingsHint')}
		>
			<span aria-hidden="true">⚙</span>
			<span>{$t('synth.transport.settings')}</span>
		</Button>
	</div>
</div>

<!-- Row 2: transport playback + track chips -->
<div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-1 bg-black/30 px-2 py-1 rounded-xs text-xs shrink-0">
	<div class="flex items-center gap-1">
		<Button
			variant="outline"
			color="#ffffff"
			onclick={rewindToStart}
			label={$t('synth.transport.rewindHint')}
			title={$t('synth.transport.rewindHint')}
			class="h-[24px] min-w-[24px] px-1.5 flex items-center justify-center"
		>
			<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
				<rect x="2" y="2.5" width="2" height="11" rx="0.5" />
				<polygon points="14,2.5 5,8 14,13.5" />
			</svg>
		</Button>

		<Button
			variant="outline"
			color="#ffffff"
			onclick={() => stepBar(-1)}
			label={$t('synth.transport.stepBackHint')}
			title={$t('synth.transport.stepBackHint')}
			class="h-[24px] min-w-[24px] px-1.5 flex items-center justify-center"
		>
			<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
				<polygon points="8,2.5 2,8 8,13.5" />
				<polygon points="14,2.5 8,8 14,13.5" />
			</svg>
		</Button>

		<Button
			variant="solid"
			color={$isSeqPlaying ? '#e06c75' : '#98c379'}
			onclick={togglePlayback}
			title={$t('synth.transport.playToggleHint')}
			sound={null}
			class="h-6 px-3 font-black flex items-center justify-center {$isSeqPlaying ? 'shadow-[0_0_8px_#e06c75]' : ''}"
		>
			<span>{$isSeqPlaying ? '■ STOP' : '► PLAY'}</span>
		</Button>

		<Button
			variant="outline"
			color="#ffffff"
			onclick={() => stepBar(1)}
			label={$t('synth.transport.stepFwdHint')}
			title={$t('synth.transport.stepFwdHint')}
			class="h-[24px] min-w-[24px] px-1.5 flex items-center justify-center"
		>
			<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
				<polygon points="8,2.5 14,8 8,13.5" />
				<polygon points="2,2.5 8,8 2,13.5" />
			</svg>
		</Button>

		<!-- LOOP repeats the pattern; ONCE plays it through, lets the last
		     notes ring out and rewinds to bar 1. -->
		<Button
			variant="outline"
			color={$loopMode ? '#98c379' : '#e5c07b'}
			active={$loopMode}
			sound="toggle"
			onclick={() => setLoopMode(!$loopMode)}
			class="h-6 px-2 flex items-center gap-1 shrink-0"
			title={$loopMode ? $t('synth.transport.loopOnHint') : $t('synth.transport.loopOffHint')}
		>
			<span aria-hidden="true">{$loopMode ? '⟲' : '→'}</span>
			<span>{$loopMode ? 'LOOP' : 'ONCE'}</span>
		</Button>

		<Button
			variant="outline"
			color="#56b6c2"
			onclick={jumpPlayheadToCursor}
			class="h-6 px-2 flex items-center gap-1 shrink-0"
			title={$t('synth.transport.jumpToCursorHint', { bar: cursorPosition.bar, beat: cursorPosition.beat, step: $cursorStep + 1, total: $totalPatternSteps })}
		>
			<span aria-hidden="true">⤹ CUR:</span>
			<span class="font-mono font-black">{cursorPosition.bar}.{cursorPosition.beat}</span>
			<span class="text-[10px] text-white/60 font-mono">({$cursorStep + 1})</span>
		</Button>
	</div>

	<TrackChips />
</div>

<!-- Row 3: sound presets, snap/dur, page nav — flex-wrap so the 9-division
     SNAP/DUR groups wrap instead of overlapping the page controls -->
<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-white/10 pb-1 bg-black/25 px-2 py-1 rounded-xs text-xs shrink-0">
	<PresetMenu />

	<div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
		<div class="flex items-center gap-1" role="group" aria-label={$t('synth.transport.snapHint')}>
			<span class="opacity-60 font-bold" title={$t('synth.transport.snapHint')}>SNAP:</span>
			{#each DIVS as d (d)}
				<Button
					variant="outline"
					color="#56b6c2"
					active={$snapDiv === d}
					onclick={() => setSnapDiv(d)}
					class="min-w-[24px] min-h-[24px]"
				>
					{d}
				</Button>
			{/each}
		</div>

		<div class="flex items-center gap-1 border-l border-white/15 pl-1.5" role="group" aria-label={$t('synth.transport.durHint')}>
			<span class="opacity-60 font-bold" title={$t('synth.transport.durHint')}>DUR:</span>
			{#each DIVS as d (d)}
				<Button
					variant="outline"
					color="#e5c07b"
					active={$noteDur === d}
					onclick={() => setNoteDur(d)}
					class="min-w-[24px] min-h-[24px]"
				>
					{d}
				</Button>
			{/each}
		</div>
	</div>

	<div class="flex items-center justify-end gap-1">
		<span class="opacity-60 font-bold" title={$t('synth.transport.pageNavHint')}>PAGE:</span>
		<Button variant="outline" color="#ffffff" onclick={prevPage} disabled={$activeStepPage === 0} label={$t('synth.transport.pagePrevHint')} title={$t('synth.transport.pagePrevHint')} class="min-w-[24px] min-h-[24px]">
			◄
		</Button>
		<div
			class="flex items-center bg-white/10 border border-white/20 hover:border-white/40 rounded-xs px-1 py-0.5 text-xs font-mono font-bold"
			title={$t('synth.transport.pageJumpHint', { page: $activeStepPage + 1, total: totalPages })}
		>
			<input
				type="text"
				inputmode="numeric"
				pattern="[0-9]*"
				value={$pageInputStr}
				onfocus={(e) => (e.target as HTMLInputElement).select()}
				oninput={onPageInput}
				onblur={onPageBlur}
				onkeydown={onPageKeydown}
				aria-label={$t('synth.transport.pageInputAria', { total: totalPages })}
				class="w-8 text-center bg-transparent text-white font-mono font-black focus:outline-none focus:bg-white/20 rounded-xs p-0 m-0"
			/>
			<span class="text-white/60 select-none">/{totalPages}</span>
		</div>
		<Button variant="outline" color="#ffffff" onclick={nextPage} disabled={$activeStepPage >= totalPages - 1} label={$t('synth.transport.pageNextHint')} title={$t('synth.transport.pageNextHint')} class="min-w-[24px] min-h-[24px]">
			►
		</Button>
		<Button
			variant="outline"
			color="#98c379"
			active={$pageFollow}
			sound="toggle"
			onclick={() => pageFollow.update((v) => !v)}
			class="min-w-[24px] min-h-[24px]"
			title={$t('synth.transport.followHint')}
		>
			FLW
		</Button>

	</div>
</div>
