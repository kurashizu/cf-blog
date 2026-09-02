<script lang="ts">
	import { onMount, tick } from 'svelte';
	import PixelIcon from '../pixel/PixelIcon.svelte';
	import Onboarding from '../chrome/Onboarding.svelte';
	import { SYNTH_TOUR } from './synth-tour';
	import { guideSeen, markGuideSeen, afterSiteGuide } from '../../stores/chrome';
	import {
		BUILTIN_SONGS,
		builtinSongIdx,
		saveStatus,
		handleNewProject,
		handleLoadBuiltinSong,
		handleSavePatch,
		handleLoadPatch,
		handleExportPatch,
		handleSharePatch,
		handleImportPatchFile,
		shareUrlFallback,
		copyText
	} from '../../stores/synth-patch';
	import { handleImportMidiFile, isMidiFile, importReport, clearImportReport } from '../../stores/synth-import';
	import { handleRenderWav, renderPhase, renderProgress, renderReport, clearRenderReport } from '../../stores/synth-render';

	let guideOpen = $state(false);

	function closeGuide() {
		guideOpen = false;
		markGuideSeen('synth');
	}

	/* Offered once, then only from the [?]. The tour's first step points at the
	   track list, which is a sibling component, so it waits a tick for the rest
	   of the workstation to render rather than spotlighting nothing -- and for
	   the site tour to close, so a first visit straight to /synth does not show
	   both at once. */
	onMount(async () => {
		if (guideSeen('synth')) return;
		await tick();
		await afterSiteGuide();
		guideOpen = true;
	});
	let fileInput: HTMLInputElement | undefined = $state();
	let isLoadMenuOpen = $state(false);
	let shareCopied = $state(false);

	/** Import and render both report into the same popover; only one is ever set. */
	let report = $derived($importReport ?? $renderReport);
	let reportIsError = $derived((report?.[0] ?? '').startsWith('✕'));

	function dismissReport() {
		clearImportReport();
		clearRenderReport();
	}

	// Any popover open/close transition resets the ✓ state.
	$effect(() => {
		$shareUrlFallback;
		shareCopied = false;
	});

	async function copyFromPopover() {
		const url = $shareUrlFallback;
		if (!url) return;
		// Fresh user gesture with no awaits before the write — this usually succeeds
		// even when the post-encode write in handleSharePatch was rejected.
		shareCopied = await copyText(url);
		if (shareCopied) setTimeout(() => shareUrlFallback.set(null), 900);
	}

	function onImportChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) {
			if (isMidiFile(file)) void handleImportMidiFile(file);
			else handleImportPatchFile(file);
		}
		if (fileInput) fileInput.value = '';
	}

	function loadLocal() {
		isLoadMenuOpen = false;
		handleLoadPatch();
	}

	function loadBuiltin(idx: number) {
		isLoadMenuOpen = false;
		handleLoadBuiltinSong(idx);
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isLoadMenuOpen) isLoadMenuOpen = false;
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div data-tour="synth-transport" class="flex items-center gap-1.5 flex-wrap">
	<div class="flex items-center gap-1.5 bg-[#c678dd]/20 border border-[#c678dd]/60 px-2 py-0.5 rounded-xs mr-0.5 select-none shadow-[0_0_8px_rgba(198,120,221,0.25)]">
		<PixelIcon name="audio" size={16} class="text-[#c678dd]" />
		<span class="font-black text-xs text-white tracking-wider">KRSZ SYNTH</span>
		<button
			onclick={() => (guideOpen = true)}
			title="Walk through the synth — what each rack does, and how to get a sound out of it"
			class="press ml-0.5 text-[#c678dd]/70 hover:text-[#c678dd] cursor-pointer transition-colors flex items-center"
			aria-label="Synth walkthrough"
		>
			<PixelIcon name="help" size={14} />
		</button>
	</div>

	{#if guideOpen}
		<Onboarding steps={SYNTH_TOUR} heading="SYNTH TOUR" onClose={closeGuide} />
	{/if}

	<input bind:this={fileInput} type="file" onchange={onImportChange} accept=".json,.mid,.midi,audio/midi" class="hidden" />

	<button onclick={handleNewProject} title="New Project — Clear all tracks and reset to blank 64-step sequencer" class="press px-2 py-0.5 border border-white/20 text-white/80 hover:border-white/60 hover:text-white rounded-xs font-bold transition-colors cursor-pointer text-xs">
		NEW
	</button>

	<button onclick={handleSavePatch} title="Save Patch — Store all 8-track synth parameters and sequencer notes into browser LocalStorage" class="press px-2 py-0.5 border border-[#98c379]/50 text-[#98c379] hover:bg-[#98c379]/20 rounded-xs font-bold transition-colors cursor-pointer text-xs">
		SAVE
	</button>

	<!-- Compact LOAD dropdown: local patch + built-in songs live in the menu, not inline -->
	<div class="relative">
		<button
			onclick={() => (isLoadMenuOpen = !isLoadMenuOpen)}
			title="Load — Local browser patch or a built-in song"
			class="press px-2 py-0.5 border rounded-xs font-bold transition-colors cursor-pointer text-xs flex items-center gap-1 {isLoadMenuOpen
				? 'border-[#56b6c2] bg-[#56b6c2] text-black'
				: 'border-[#56b6c2]/50 bg-[#56b6c2]/10 text-[#56b6c2] hover:bg-[#56b6c2]/25'}"
		>
			<span>LOAD</span>
			<span class="text-[9px] leading-none inline-block transition-transform duration-150" style={isLoadMenuOpen ? 'transform: rotate(180deg)' : undefined}>▼</span>
		</button>

		{#if isLoadMenuOpen}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="fixed inset-0 z-40" onclick={() => (isLoadMenuOpen = false)}></div>

			<div class="dropdown-pop origin-top absolute left-0 top-full mt-1 z-50 min-w-[290px] bg-[#121417] border border-[#56b6c2]/50 rounded-xs shadow-[0_8px_24px_rgba(0,0,0,0.7)] py-1 text-xs font-mono">
				<button onclick={loadLocal} class="press w-full text-left px-2.5 py-1.5 flex items-center gap-2 text-[#56b6c2] hover:bg-[#56b6c2]/20 cursor-pointer font-bold transition-colors" title="Restore saved synth parameters and sequencer patterns from browser LocalStorage">
					<span class="shrink-0">▣</span>
					<span>LOCAL PATCH (BROWSER)</span>
				</button>

				<div class="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold text-white/40 border-t border-white/10 mt-1 select-none">BUILT-IN SONGS</div>

				{#each BUILTIN_SONGS as song, idx (song.id)}
					<button
						onclick={() => loadBuiltin(idx)}
						class="press w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2 cursor-pointer transition-colors {$builtinSongIdx === idx
							? 'text-white bg-white/10 font-bold'
							: 'text-white/80 hover:bg-white/10'}"
						title={`Load ${song.name} (${song.bpm} BPM, ${song.meter}, ${song.steps} steps)`}
					>
						<span class="flex items-center gap-2 min-w-0">
							<span class="shrink-0 {$builtinSongIdx === idx ? 'text-[#98c379]' : 'text-white/25'}">{$builtinSongIdx === idx ? '●' : '○'}</span>
							<span class="truncate">{song.name}</span>
						</span>
						<span class="shrink-0 text-[10px] text-white/40">{song.bpm}bpm · {song.meter}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<button onclick={() => fileInput?.click()} class="press px-2 py-0.5 border border-white/20 text-white/70 hover:border-white/60 hover:text-white rounded-xs font-bold transition-colors cursor-pointer text-xs" title="Import — A previously exported JSON patch, or a .mid file: every MIDI track becomes a sequencer track, with the file's own tempo and time signature. You can also drop the file anywhere on this page.">
		IMP
	</button>

	<button onclick={handleExportPatch} class="press px-2 py-0.5 border border-white/20 text-white/70 hover:border-white/60 hover:text-white rounded-xs font-bold transition-colors cursor-pointer text-xs" title="Export Patch — Download complete 8-track synthesizer configuration and patterns as a JSON file">
		EXP
	</button>

	<button
		onclick={handleRenderWav}
		disabled={$renderPhase === 'rendering'}
		class="press px-2 py-0.5 border rounded-xs font-bold transition-colors cursor-pointer text-xs disabled:cursor-wait {$renderPhase === 'rendering'
			? 'border-[#e5c07b] bg-[#e5c07b]/20 text-[#e5c07b]'
			: 'border-[#e5c07b]/50 text-[#e5c07b] hover:bg-[#e5c07b]/20'}"
		title="Render WAV — Bounce the whole pattern through the real signal chain offline and download it as 16-bit stereo WAV. A dense multi-minute song can take a minute or two; the button shows live progress."
	>
		{#if $renderPhase === 'rendering'}
			{$renderProgress
				? `${$renderProgress.stage === 'schedule' ? 'SCHED' : 'RENDER'} ${Math.round($renderProgress.fraction * 100)}%`
				: 'RENDERING…'}
		{:else}
			WAV
		{/if}
	</button>

	<!-- SHARE + its blocked-clipboard popover: absolutely positioned so it never reflows the rack -->
	<div class="relative">
		<button onclick={handleSharePatch} class="press px-2 py-0.5 border border-[#c678dd]/50 text-[#c678dd] hover:bg-[#c678dd]/20 rounded-xs font-bold transition-colors cursor-pointer text-xs" title="Share Patch — Compress the whole patch into a URL and copy it; anyone opening the link gets your exact tracks and patterns">
			SHARE
		</button>

		{#if $shareUrlFallback}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="fixed inset-0 z-40" onclick={() => (shareUrlFallback.set(null), (shareCopied = false))}></div>

			<div class="dropdown-pop origin-top absolute left-0 top-full mt-1 z-50 w-[min(440px,80vw)] bg-[#121417] border border-[#c678dd]/50 rounded-xs shadow-[0_8px_24px_rgba(0,0,0,0.7)] p-2 space-y-1.5">
				<div class="text-[10px] font-mono text-white/50">Clipboard was blocked by the browser — copy the link here:</div>
				<div class="flex items-center gap-1.5">
					<input
						type="text"
						readonly
						value={$shareUrlFallback}
						onfocus={(e) => (e.target as HTMLInputElement).select()}
						onclick={(e) => (e.target as HTMLInputElement).select()}
						class="focus-glow flex-1 min-w-0 bg-black/60 border border-[#c678dd]/40 text-[#c678dd] text-[10px] font-mono px-2 py-1 rounded-xs outline-none" style="--krsz-focus-color: #c678dd"
					/>
					<button
						onclick={copyFromPopover}
						class="press px-2 py-1 border rounded-xs font-bold text-[10px] cursor-pointer transition-colors {shareCopied
							? 'border-[#98c379] text-[#98c379]'
							: 'border-[#c678dd]/50 text-[#c678dd] hover:bg-[#c678dd]/20'}"
					>
						{shareCopied ? '✓' : 'COPY'}
					</button>
					<button
						onclick={() => (shareUrlFallback.set(null), (shareCopied = false))}
						class="press px-2 py-1 border border-white/20 text-white/60 hover:border-white/60 hover:text-white rounded-xs font-bold text-[10px] cursor-pointer transition-colors"
					>
						✕
					</button>
				</div>
			</div>
		{/if}
	</div>

	{#if $saveStatus}
		<span class="text-[#98c379] font-bold text-xs ml-1">{$saveStatus}</span>
	{/if}
</div>

{#if report}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="scrim-in fixed inset-0 z-[120] bg-black/40" onclick={dismissReport}></div>
	<div
		class="modal-pop fixed z-[130] left-1/2 top-16 -translate-x-1/2 w-[min(560px,92vw)] bg-[#121417] border rounded-xs shadow-[0_12px_32px_rgba(0,0,0,0.8)] p-3 space-y-1 font-mono {reportIsError ? 'shake-once' : ''}"
		style="border-color: {reportIsError ? '#e06c75' : '#98c379'}88"
	>
		<div class="flex items-start justify-between gap-2 border-b border-white/10 pb-1.5">
			<span class="text-xs font-black break-all" style="color: {reportIsError ? '#e06c75' : '#98c379'}">{report[0]}</span>
			<button onclick={dismissReport} class="press text-xs text-white/50 hover:text-white cursor-pointer shrink-0 transition-colors">[ ✕ ]</button>
		</div>
		<div class="text-[11px] text-white/70 leading-relaxed whitespace-pre-wrap max-h-[46vh] overflow-y-auto custom-scrollbar">
			{#each report.slice(1) as line, i (i)}
				<div>{line}</div>
			{/each}
		</div>
	</div>
{/if}
