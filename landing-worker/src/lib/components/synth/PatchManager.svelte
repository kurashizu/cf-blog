<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { t, locale } from '$lib/i18n';
	import { fade, scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
	import PixelIcon from '../pixel/PixelIcon.svelte';
	import Onboarding from '../chrome/Onboarding.svelte';
	import { synthTour } from './synth-tour';
	import { guideSeen, markGuideSeen, enqueueOnboarding, dequeueOnboarding, isOnboardingActive, openOnboardingNow } from '../../stores/chrome';
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
	import { Button, Menu, MenuItem } from '$lib/components/ui';
	import { modal } from '$lib/actions/modal';
	import { announce } from '$lib/stores/a11y';

	const TOUR = 'synth-tour';
	let guideActive = isOnboardingActive(TOUR);
	// $locale is read here only to give this $derived a tracked dependency —
	// synthTour() itself resolves strings through tr(), which is not reactive.
	let tourSteps = $derived.by(() => {
		void $locale;
		return synthTour();
	});

	function closeGuide() {
		dequeueOnboarding(TOUR);
		markGuideSeen('synth');
	}

	/* Offered once, then only from the [?]. The tour's first step points at the
	   track list, which is a sibling component, so it waits a tick for the rest
	   of the workstation to render rather than spotlighting nothing. Queuing
	   (rather than the old await-then-open) means this can enqueue immediately
	   and simply wait its turn -- there is no window where it and the site's
	   own boot/welcome/tour are both showing, because "showing" is just "am I
	   the front of the queue" (see onboardingQueue in stores/chrome.ts), and
	   the queue is never observed empty between one stage closing and the
	   next opening. */
	onMount(async () => {
		if (guideSeen('synth')) return;
		await tick();
		enqueueOnboarding(TOUR);
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

	// Save/load status and import/render reports change without moving focus —
	// a screen-reader user only sees them if they are announced.
	$effect(() => {
		if ($saveStatus) announce($saveStatus);
	});
	$effect(() => {
		if (report) announce(report[0], reportIsError ? 'assertive' : 'polite');
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
			else void handleImportPatchFile(file);
		}
		if (fileInput) fileInput.value = '';
	}

	/* Loading closed the menu immediately, so the "loaded" confirmation had
	   nowhere to land but the toolbar's shared status slot next to SHARE --
	   easy to miss, and not obviously about LOAD. It renders inside the menu
	   instead now; loadStatusActive keeps it out of the toolbar slot for the
	   full 2s showSaveStatus keeps the message alive, not just while the
	   menu happens to still be open (the menu closes sooner, on its own timer,
	   and the toolbar slot re-showing the stale message once it did was
	   exactly the bug this is fixing). */
	let loadStatusActive = $state(false);

	function loadLocal() {
		handleLoadPatch();
		loadStatusActive = true;
		setTimeout(() => (isLoadMenuOpen = false), 900);
		setTimeout(() => (loadStatusActive = false), 2000);
	}

	function loadBuiltin(idx: number) {
		handleLoadBuiltinSong(idx);
		loadStatusActive = true;
		setTimeout(() => (isLoadMenuOpen = false), 900);
		setTimeout(() => (loadStatusActive = false), 2000);
	}

</script>

<div data-tour="synth-transport" class="flex items-center gap-1.5 flex-wrap">
	<div class="flex items-center gap-1.5 bg-[#c678dd]/20 border border-[#c678dd]/60 px-2 py-0.5 rounded-xs mr-0.5 select-none shadow-[0_0_8px_rgba(198,120,221,0.25)]">
		<PixelIcon name="audio" size={16} class="text-[#c678dd]" />
		<span class="font-black text-xs text-white tracking-wider">KRSZ SYNTH</span>
		<button
			onclick={() => openOnboardingNow(TOUR)}
			title={$t('synth.badge.walkthroughHint')}
			class="press ml-0.5 text-[#c678dd]/70 hover:text-[#c678dd] cursor-pointer transition-colors flex items-center"
			aria-label={$t('synth.badge.walkthroughAria')}
		>
			<PixelIcon name="help" size={14} />
		</button>
	</div>

	{#if $guideActive}
		<Onboarding steps={tourSteps} heading="SYNTH TOUR" onClose={closeGuide} />
	{/if}

	<input bind:this={fileInput} type="file" onchange={onImportChange} accept=".json,.json.gz,.gz,.mid,.midi,audio/midi" class="hidden" />

	<Button variant="outline" color="#ffffff" onclick={handleNewProject} title={$t('synth.patch.newHint')}>
		NEW
	</Button>

	<Button variant="outline" color="#98c379" onclick={handleSavePatch} title={$t('synth.patch.saveHint')}>
		SAVE
	</Button>

	<!-- Compact LOAD dropdown: local patch + built-in songs live in the menu, not inline -->
	<div class="relative">
		<Button
			variant="outline"
			color="#56b6c2"
			active={isLoadMenuOpen}
			onclick={() => (isLoadMenuOpen = !isLoadMenuOpen)}
			title={$t('synth.patch.loadHint')}
			class="flex items-center gap-1"
		>
			<span>LOAD</span>
			<span aria-hidden="true" class="text-[9px] leading-none inline-block transition-transform duration-150" style={isLoadMenuOpen ? 'transform: rotate(180deg)' : undefined}>▼</span>
		</Button>

		{#if isLoadMenuOpen}
			<Menu
				onClose={() => (isLoadMenuOpen = false)}
				label={$t('synth.patch.loadHint')}
				color="#56b6c2"
				class="origin-top absolute left-0 top-full mt-1 z-50 w-max min-w-[290px] max-w-[90vw]"
			>
				{#if $saveStatus}
					<div class="px-2.5 pb-1.5 mb-1 border-b border-white/10 text-[#98c379] font-bold" aria-hidden="true">{$saveStatus}</div>
				{/if}

				<MenuItem onclick={loadLocal} class="text-[#56b6c2] hover:bg-[#56b6c2]/20 font-bold" title={$t('synth.patch.loadLocalHint')}>
					<span aria-hidden="true">▣</span>
					<span>{$t('synth.patch.loadLocalLabel')}</span>
				</MenuItem>

				<div class="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold text-white/60 border-t border-white/10 mt-1 select-none" aria-hidden="true">{$t('synth.patch.builtinSongsLabel')}</div>

				{#each BUILTIN_SONGS as song, idx (song.id)}
					<MenuItem
						onclick={() => loadBuiltin(idx)}
						checked={$builtinSongIdx === idx}
						note="{song.bpm}bpm · {song.meter}"
						class={$builtinSongIdx === idx ? 'text-white font-bold' : 'text-white/80'}
						title={$t('synth.patch.loadSongHint', { name: song.name, bpm: song.bpm, meter: song.meter, steps: song.steps })}
					>
						{song.name}
					</MenuItem>
				{/each}
			</Menu>
		{/if}
	</div>

	<Button variant="outline" color="#ffffff" onclick={() => fileInput?.click()} title={$t('synth.patch.importHint')}>
		IMP
	</Button>

	<Button variant="outline" color="#ffffff" onclick={handleExportPatch} title={$t('synth.patch.exportHint')}>
		EXP
	</Button>

	<Button
		variant="outline"
		color="#e5c07b"
		active={$renderPhase === 'rendering'}
		onclick={handleRenderWav}
		disabled={$renderPhase === 'rendering'}
		class="disabled:cursor-wait"
		title={$t('synth.patch.renderHint')}
	>
		{#if $renderPhase === 'rendering'}
			{$renderProgress
				? $t('synth.patch.renderingStage', { stage: $renderProgress.stage === 'schedule' ? $t('synth.patch.renderingStageSchedule') : $t('synth.patch.renderingStageRender'), percent: Math.round($renderProgress.fraction * 100) })
				: $t('synth.patch.rendering')}
		{:else}
			WAV
		{/if}
	</Button>

	<!-- SHARE + its blocked-clipboard popover: absolutely positioned so it never reflows the rack -->
	<div class="relative">
		<Button variant="outline" color="#c678dd" onclick={handleSharePatch} title={$t('synth.patch.shareHint')}>
			SHARE
		</Button>

		{#if $shareUrlFallback}
			<div
				use:modal={{ onClose: () => (shareUrlFallback.set(null), (shareCopied = false)), label: $t('synth.patch.shareHint'), inertPage: false }}
				class="origin-top absolute left-0 top-full mt-1 z-50 w-[min(440px,80vw)] bg-[#121417] border border-[#c678dd]/50 rounded-xs shadow-[0_8px_24px_rgba(0,0,0,0.7)] p-2 space-y-1.5"
				transition:scale={{ duration: 140, start: 0.95, opacity: 0, easing: cubicOut }}
			>
				<div class="text-[10px] font-mono text-white/50">{$t('synth.patch.shareBlocked')}</div>
				<div class="flex items-center gap-1.5">
					<input
						type="text"
						readonly
						value={$shareUrlFallback}
						onfocus={(e) => (e.target as HTMLInputElement).select()}
						onclick={(e) => (e.target as HTMLInputElement).select()}
						aria-label={$t('synth.patch.shareHint')}
						class="focus-glow flex-1 min-w-0 bg-black/60 border border-[#c678dd]/40 text-[#c678dd] text-[10px] font-mono px-2 py-1 rounded-xs outline-none" style="--krsz-focus-color: #c678dd"
					/>
					<Button
						variant="outline"
						color={shareCopied ? '#98c379' : '#c678dd'}
						size="xs"
						onclick={copyFromPopover}
					>
						{shareCopied ? '✓' : $t('common.copy').toUpperCase()}
					</Button>
					<Button
						variant="outline"
						color="#ffffff"
						size="xs"
						label={$t('a11y.dialog.close')}
						onclick={() => (shareUrlFallback.set(null), (shareCopied = false))}
					>
						✕
					</Button>
				</div>
			</div>
		{/if}
	</div>

	{#if $saveStatus && !isLoadMenuOpen && !loadStatusActive}
		<span class="text-[#98c379] font-bold text-xs ml-1">{$saveStatus}</span>
	{/if}
</div>

{#if report}
	<div
		use:modal={{ onClose: dismissReport, label: report[0] }}
		class="ui-scrim"
		style="z-index: 120"
		transition:fade={{ duration: 180 }}
	>
		<div
			class="w-[min(560px,92vw)] bg-[#121417] border rounded-xs shadow-[0_12px_32px_rgba(0,0,0,0.8)] p-3 space-y-1 font-mono {reportIsError ? 'shake-once' : ''}"
			style="border-color: {reportIsError ? '#e06c75' : '#98c379'}88"
			transition:scale={{ duration: 180, start: 0.96, opacity: 0, easing: cubicOut }}
		>
			<div class="flex items-start justify-between gap-2 border-b border-white/10 pb-1.5">
				<span class="text-xs font-black break-all" style="color: {reportIsError ? '#e06c75' : '#98c379'}">{report[0]}</span>
				<Button variant="ghost" size="xs" label={$t('a11y.dialog.close')} onclick={dismissReport} class="shrink-0">[ ✕ ]</Button>
			</div>
			<div class="text-[11px] text-white/70 leading-relaxed whitespace-pre-wrap max-h-[46vh] overflow-y-auto custom-scrollbar">
				{#each report.slice(1) as line, i (i)}
					<div>{line}</div>
				{/each}
			</div>
		</div>
	</div>
{/if}
