<script lang="ts">
	import { playSound } from '../../sound';
	import { setMuted } from '../../stores/sound';
	import { METER_SPECS, type TimeSignature, type NoteDurationDiv } from '../../synth';
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
		jumpPlayheadToCursor
	} from '../../stores/synth-transport';
	import { SOUND_PRESETS, soundPresetIdx } from '../../stores/synth-patch';
	import { updateActiveTrack } from '../../stores/synth-tracks';
	import { PRESET_TOOLTIPS } from './tooltips';
	import PatchManager from './PatchManager.svelte';
	import TrackChips from './TrackChips.svelte';
	import HorizontalHardwareFader from '../hardware/HorizontalHardwareFader.svelte';

	const METERS: TimeSignature[] = ['4/4', '3/4', '2/4', '5/4', '6/8', '7/8'];
	const DIVS: NoteDurationDiv[] = ['4', '2', '1', '1/2', '1/3', '1/4', '1/6', '1/8', '1/12'];
	const LEN_PRESETS = [16, 32, 64, 128, 256, 512];

	let lenIsCustom = $derived(!LEN_PRESETS.includes($totalPatternSteps));

	function cycleLen() {
		const currentIdx = LEN_PRESETS.indexOf($totalPatternSteps);
		const nextLen = currentIdx >= 0 && currentIdx < LEN_PRESETS.length - 1 ? LEN_PRESETS[currentIdx + 1] : LEN_PRESETS[0];
		setTotalPatternSteps(nextLen);
		playSound('click');
	}

	function onLenInput(e: Event) {
		const raw = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
		const val = parseInt(raw, 10);
		if (!isNaN(val)) {
			setTotalPatternSteps(Math.max(1, Math.min(4096, val)));
		} else if (raw === '') {
			totalPatternSteps.set(0);
		}
	}

	function onLenBlur() {
		if (!$totalPatternSteps || $totalPatternSteps < 8) setTotalPatternSteps(8);
	}

	function prevPreset() {
		soundPresetIdx.update((i) => (i - 1 + SOUND_PRESETS.length) % SOUND_PRESETS.length);
		playSound('click');
	}
	function nextPreset() {
		soundPresetIdx.update((i) => (i + 1) % SOUND_PRESETS.length);
		playSound('click');
	}
	function applyPreset() {
		const sel = SOUND_PRESETS[$soundPresetIdx];
		if (sel) {
			updateActiveTrack(sel.preset);
			playSound('toggle');
		}
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

<!-- Row 1: logo/project management + BPM/LEN/METER -->
<div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-1 bg-black/40 px-2 py-1.5 rounded-xs shrink-0">
	<PatchManager />

	<div class="flex flex-wrap items-center gap-1.5 text-xs ml-auto">
		<div class="flex items-center gap-1">
			<HorizontalHardwareFader label="BPM:" value={$bpm} min={40} max={240} step={1} width={74} showValue color="#98c379" onChange={setBpm} />
		</div>

		<div class="w-px h-4 bg-white/15 mx-1"></div>

		<div class="flex items-center gap-1">
			<span class="opacity-60 font-bold" title="Pattern Total Steps (LEN) — Total active sequence steps before looping">LEN:</span>
			<button onclick={cycleLen} class="px-2 py-0.5 border border-[#98c379]/50 text-[#98c379] hover:bg-[#98c379]/20 rounded-xs font-bold font-mono cursor-pointer transition-colors flex items-center gap-1" title="Cycle through step lengths: 16 → 32 → 64 → 128 → 256 → 512 → 16">
				<span>{LEN_PRESETS.includes($totalPatternSteps) ? $totalPatternSteps : 64}</span>
				<span class="text-[10px] opacity-70">⟳</span>
			</button>
			<span class="text-white/40 text-[10px] font-bold px-0.5 select-none">OR</span>
			<input
				type="text"
				inputmode="numeric"
				value={$totalPatternSteps || ''}
				oninput={onLenInput}
				onblur={onLenBlur}
				class="w-12 px-1 py-0.5 text-center text-xs font-mono font-bold bg-black/60 border rounded-xs outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none {lenIsCustom
					? 'border-[#98c379] text-[#98c379]'
					: 'border-white/20 text-white/70 focus:border-white/60'}"
				title="Custom Step Length — Set arbitrary loop duration (e.g. 1184 steps for the complete Mario theme)"
			/>
		</div>

		<div class="w-px h-4 bg-white/15 mx-1"></div>

		<div class="flex items-center gap-1">
			<span class="opacity-70 font-bold" title="Time Signature (METER) — Defines beats per measure and metric pulse subdivision">METER:</span>
			{#each METERS as sig (sig)}
				<button
					onclick={() => {
						setTimeMeter(sig);
						playSound('click');
					}}
					class="px-1.5 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors {$timeMeter === sig
						? 'border-[#c678dd] bg-[#c678dd] text-black font-black'
						: 'border-white/20 text-white/70 hover:border-white/50'}"
					title={METER_SPECS[sig].name}
				>
					{sig}
				</button>
			{/each}
		</div>
	</div>
</div>

<!-- Row 2: transport playback + track chips -->
<div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-1 bg-black/30 px-2 py-1 rounded-xs text-xs shrink-0">
	<div class="flex items-center gap-1">
		<button
			onclick={() => {
				rewindToStart();
				playSound('click');
			}}
			class="h-6 px-1.5 border border-white/20 hover:border-white/60 text-white/70 hover:text-white rounded-xs font-bold transition-colors cursor-pointer text-xs flex items-center justify-center"
			title="Rewind to Beginning (Step 1 / Bar 1.1)"
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
			title="Step 1 Bar Backward (◄◄)"
		>
			<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
				<polygon points="8,2.5 2,8 8,13.5" />
				<polygon points="14,2.5 8,8 14,13.5" />
			</svg>
		</button>

		<button
			onclick={togglePlayback}
			title="Play / Stop Sequencer (Resumes from current paused position)"
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
			title="Step 1 Bar Forward (►►)"
		>
			<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
				<polygon points="8,2.5 14,8 8,13.5" />
				<polygon points="2,2.5 8,8 2,13.5" />
			</svg>
		</button>

		<button
			onclick={() => {
				jumpPlayheadToCursor();
				playSound('click');
			}}
			class="h-6 px-2 border border-[#56b6c2]/40 hover:border-[#56b6c2] text-[#56b6c2] hover:bg-[#56b6c2]/10 rounded-xs font-bold transition-colors cursor-pointer text-xs flex items-center gap-1 shrink-0"
			title={`Jump Playhead to Cursor Position (Bar ${cursorPosition.bar}.${cursorPosition.beat}, Step ${$cursorStep + 1}/${$totalPatternSteps}) — Click to jump`}
		>
			<span>⤹ CUR:</span>
			<span class="font-mono font-black">{cursorPosition.bar}.{cursorPosition.beat}</span>
			<span class="text-[10px] opacity-60 font-mono">({$cursorStep + 1})</span>
		</button>
	</div>

	<TrackChips />
</div>

<!-- Row 3: sound presets, snap/dur, page nav — flex-wrap so the 9-division
     SNAP/DUR groups wrap instead of overlapping the page controls -->
<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-white/10 pb-1 bg-black/25 px-2 py-1 rounded-xs text-xs shrink-0">
	<div class="flex items-center gap-0.5 justify-start text-xs">
		<span class="text-white/60 font-bold text-[11px] pl-0.5">PRESET:</span>
		<button onclick={prevPreset} class="px-1 text-[#56b6c2] hover:text-white cursor-pointer font-bold select-none" title="Previous Sound Preset">◄</button>
		<button
			onclick={applyPreset}
			class="px-1.5 py-0.5 border border-white/20 hover:border-[#56b6c2] bg-white/5 hover:bg-white/15 rounded-xs font-bold text-white hover:text-[#56b6c2] cursor-pointer transition-colors"
			title={`Click to load preset: ${PRESET_TOOLTIPS[SOUND_PRESETS[$soundPresetIdx]?.name] || SOUND_PRESETS[$soundPresetIdx]?.name}`}
		>
			{SOUND_PRESETS[$soundPresetIdx]?.name}
		</button>
		<button onclick={nextPreset} class="px-1 text-[#56b6c2] hover:text-white cursor-pointer font-bold select-none" title="Next Sound Preset">►</button>
	</div>

	<div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
		<div class="flex items-center gap-1">
			<span class="opacity-60 font-bold" title="Grid Quantization / Snap Alignment">SNAP:</span>
			{#each DIVS as d (d)}
				<button
					onclick={() => {
						setSnapDiv(d);
						playSound('click');
					}}
					class="px-1.5 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors {$snapDiv === d ? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black' : 'border-white/20 text-white/70 hover:border-white/50'}"
				>
					{d}
				</button>
			{/each}
		</div>

		<div class="flex items-center gap-1 border-l border-white/15 pl-1.5">
			<span class="opacity-60 font-bold" title="Placed Note Duration / Length">DUR:</span>
			{#each DIVS as d (d)}
				<button
					onclick={() => {
						setNoteDur(d);
						playSound('click');
					}}
					class="px-1.5 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors {$noteDur === d ? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black' : 'border-white/20 text-white/70 hover:border-white/50'}"
				>
					{d}
				</button>
			{/each}
		</div>
	</div>

	<div class="flex items-center justify-end gap-1">
		<span class="opacity-60 font-bold" title="Step Page Navigation">PAGE:</span>
		<button onclick={prevPage} disabled={$activeStepPage === 0} class="px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs" title="Previous Page (◄)">
			◄
		</button>
		<div
			class="flex items-center bg-white/10 border border-white/20 hover:border-white/40 rounded-xs px-1 py-0.5 text-xs font-mono font-bold"
			title={`Active Measure Page: Page ${$activeStepPage + 1} of ${totalPages} — Click/type number to jump`}
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
				class="w-8 text-center bg-transparent text-white font-mono font-black focus:outline-none focus:bg-white/20 rounded-xs p-0 m-0"
			/>
			<span class="opacity-40 select-none">/{totalPages}</span>
		</div>
		<button onclick={nextPage} disabled={$activeStepPage >= totalPages - 1} class="px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs" title="Next Page (►)">
			►
		</button>
		<button
			onclick={() => {
				pageFollow.update((v) => !v);
				playSound('toggle');
			}}
			class="px-1.5 py-0.5 border rounded-xs font-bold cursor-pointer text-xs {$pageFollow ? 'border-[#98c379] bg-[#98c379] text-black font-black' : 'border-white/20 text-white/50'}"
			title="Follow Playhead Mode (FLW) — Automatically turns pages as the sequencer plays"
		>
			FLW
		</button>
	</div>
</div>
