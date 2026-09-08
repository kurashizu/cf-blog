<script lang="ts">
	import { fade, scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
	import { t } from '$lib/i18n';
	import BoxHeader from './BoxHeader.svelte';
	import { resolvedTheme, THEME_STYLES } from '../../stores/theme';

	let { onClose }: { onClose: () => void } = $props();

	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);

	interface Group {
		title: string;
		color: string;
		note?: string;
		keys: { key: string; desc: string }[];
	}

	/** Mirrors the real bindings in +layout.svelte, CommandConsole and PianoKeyboard.
	 *  Titles/notes/descriptions resolve through $t() in this $derived, not a
	 *  module-level constant, since the locale isn't known at module load time. */
	let GROUPS: Group[] = $derived([
		{
			title: $t('chrome.hotkeys.global'),
			color: '#56b6c2',
			note: $t('chrome.hotkeys.globalNote'),
			keys: [
				{ key: 'Ctrl+0', desc: $t('chrome.hotkeys.view0') },
				{ key: 'Ctrl+1', desc: $t('chrome.hotkeys.view1') },
				{ key: 'Ctrl+2', desc: $t('chrome.hotkeys.view2') },
				{ key: 'Ctrl+3', desc: $t('chrome.hotkeys.view3') },
				{ key: 'Ctrl+4', desc: $t('chrome.hotkeys.view4') },
				{ key: 'Ctrl+5', desc: $t('chrome.hotkeys.view5') },
				{ key: 'T', desc: $t('chrome.hotkeys.cycleTheme') },
				{ key: '`', desc: $t('chrome.hotkeys.dropdownConsole') },
				{ key: '? or F1', desc: $t('chrome.hotkeys.thisReference') },
				{ key: 'guide', desc: $t('chrome.hotkeys.guideCmd') },
				{ key: 'Esc', desc: $t('chrome.hotkeys.closeOverlay') }
			]
		},
		{
			title: $t('chrome.hotkeys.console'),
			color: '#98c379',
			note: $t('chrome.hotkeys.consoleNote'),
			keys: [
				{ key: 'Tab', desc: $t('chrome.hotkeys.consoleTab') },
				{ key: '→ / End', desc: $t('chrome.hotkeys.consoleGhost') },
				{ key: '↑ / ↓', desc: $t('chrome.hotkeys.consoleHistory') },
				{ key: 'Ctrl+L', desc: $t('chrome.hotkeys.consoleClear') },
				{ key: 'Esc', desc: $t('chrome.hotkeys.consoleClearLine') },
				{ key: '|', desc: $t('chrome.hotkeys.consolePipe') }
			]
		},
		{
			title: $t('chrome.hotkeys.synthTransport'),
			color: '#98c379',
			note: $t('chrome.hotkeys.synthTransportNote'),
			keys: [
				{ key: 'Space / Enter', desc: $t('chrome.hotkeys.transportPlay') },
				{ key: 'Home', desc: $t('chrome.hotkeys.transportRewind') },
				{ key: 'Backspace', desc: $t('chrome.hotkeys.transportStopRewind') },
				{ key: '← / →', desc: $t('chrome.hotkeys.transportPage') },
				{ key: '↑ / ↓', desc: $t('chrome.hotkeys.transportPreset') },
				{ key: '1 – 8', desc: $t('chrome.hotkeys.transportTrack') },
				{ key: 'M / S / L / F', desc: $t('chrome.hotkeys.transportMuteSolo') },
				{ key: ', / .', desc: $t('chrome.hotkeys.transportCursorBar') },
				{ key: 'Right-click', desc: $t('chrome.hotkeys.transportResetKnob') },
				{ key: '- / =', desc: $t('chrome.hotkeys.transportTempo') }
			]
		},
		{
			title: $t('chrome.hotkeys.synthPianoRoll'),
			color: '#c678dd',
			note: $t('chrome.hotkeys.synthPianoRollNote'),
			keys: [
				{ key: 'click / drag', desc: $t('chrome.hotkeys.rollPlace') },
				{ key: 'click a note', desc: $t('chrome.hotkeys.rollSelect') },
				{ key: 'Right-click', desc: $t('chrome.hotkeys.rollDelete') },
				{ key: '← ↑ → ↓', desc: $t('chrome.hotkeys.rollNudge') },
				{ key: 'Delete / Esc', desc: $t('chrome.hotkeys.rollDeleteSel') },
				{ key: 'Ctrl+A', desc: $t('chrome.hotkeys.rollSelectAll') },
				{ key: 'Ctrl+C / X / V', desc: $t('chrome.hotkeys.rollCopyPaste') },
				{ key: 'Ctrl+D', desc: $t('chrome.hotkeys.rollRepeat') },
				{ key: 'Ctrl+Z / Ctrl+Shift+Z', desc: $t('chrome.hotkeys.rollUndoRedo') }
			]
		},
		{
			title: $t('chrome.hotkeys.lifelab'),
			color: '#61afef',
			note: $t('chrome.hotkeys.lifelabNote'),
			keys: [
				{ key: 'Space', desc: $t('chrome.hotkeys.lifelabRunPause') },
				{ key: 'N or .', desc: $t('chrome.hotkeys.lifelabStep') },
				{ key: 'click / drag', desc: $t('chrome.hotkeys.lifelabPlace') },
				{ key: 'R / F', desc: $t('chrome.hotkeys.lifelabRotate') },
				{ key: '← ↑ → ↓', desc: $t('chrome.hotkeys.lifelabNudge') },
				{ key: 'Enter / Esc / Del', desc: $t('chrome.hotkeys.lifelabDrop') },
				{ key: 'Ctrl+Z', desc: $t('chrome.hotkeys.lifelabUndo') },
				{ key: 'Ctrl+C / V / D / S', desc: $t('chrome.hotkeys.lifelabCopyPaste') },
				{ key: 'wheel / pinch', desc: $t('chrome.hotkeys.lifelabZoom') }
			]
		},
		{
			title: $t('chrome.hotkeys.synthQwerty'),
			color: '#c678dd',
			note: $t('chrome.hotkeys.synthQwertyNote'),
			keys: [
				{ key: 'Z S X D C V G B H N J M , L .', desc: $t('chrome.hotkeys.qwertyLower') },
				{ key: 'Q 2 W 3 E R 5 T 6 Y 7 U I 9 O 0 P', desc: $t('chrome.hotkeys.qwertyUpper') },
				{ key: 'Ctrl / Shift', desc: $t('chrome.hotkeys.qwertyOctave') },
				{ key: 'Space', desc: $t('chrome.hotkeys.qwertySustain') }
			]
		}
	]);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-[160] bg-black/70 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-2 sm:p-6 overflow-y-auto"
	onclick={onClose}
	transition:fade={{ duration: 180 }}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="w-full max-w-3xl {themeStyles.cardBgVideo} border {themeStyles.border} rounded-sm shadow-[0_16px_48px_rgba(0,0,0,0.8)] font-mono my-auto"
		onclick={(e) => e.stopPropagation()}
		transition:scale={{ duration: 180, start: 0.96, opacity: 0, easing: cubicOut }}
	>
		<BoxHeader title="KEYMAP // KRSZ.IN" short="KEYMAP" class="text-xs sm:text-sm font-black px-3 py-2 border-b {themeStyles.border} {themeStyles.headerBgVideo} rounded-t-sm" style="color: {themeStyles.cursorColor}">
			<button onclick={onClose} class="press text-xs text-white/50 hover:text-white cursor-pointer font-normal transition-colors">[ Esc ]</button>
		</BoxHeader>

		<div class="p-3 sm:p-4 space-y-3 max-h-[80vh] overflow-y-auto custom-scrollbar">
			{#each GROUPS as group (group.title)}
				<div class="border rounded-xs bg-black/25 p-2.5" style="border-color: {group.color}44">
					<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-white/10 pb-1 mb-1.5">
						<span class="text-xs sm:text-sm font-black" style="color: {group.color}">{group.title}</span>
						{#if group.note}
							<span class="text-[10px] sm:text-xs text-white/40">{group.note}</span>
						{/if}
					</div>
					<div class="space-y-1">
						{#each group.keys as k (k.key)}
							<div class="flex items-baseline gap-2 sm:gap-3">
								<kbd
									class="shrink-0 px-1.5 py-0.5 rounded-xs border bg-black/50 text-[10px] sm:text-xs font-bold whitespace-nowrap"
									style="border-color: {group.color}66; color: {group.color}"
								>
									{k.key}
								</kbd>
								<span class="text-[11px] sm:text-xs text-white/70 leading-snug">{k.desc}</span>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
