<script lang="ts">
	import { theme, THEME_STYLES } from '../../stores/theme';

	let { onClose }: { onClose: () => void } = $props();

	let themeStyles = $derived(THEME_STYLES[$theme]);

	interface Group {
		title: string;
		color: string;
		note?: string;
		keys: { key: string; desc: string }[];
	}

	/** Mirrors the real bindings in +layout.svelte, CommandConsole and PianoKeyboard. */
	const GROUPS: Group[] = [
		{
			title: 'GLOBAL',
			color: '#56b6c2',
			note: 'Ctrl+0-5 works everywhere, including inside the key-capturing testers',
			keys: [
				{ key: 'Ctrl+0', desc: 'View 0 — modules' },
				{ key: 'Ctrl+1', desc: 'View 1 — guestbook' },
				{ key: 'Ctrl+2', desc: 'View 2 — synth' },
				{ key: 'Ctrl+3', desc: 'View 3 — utils' },
				{ key: 'Ctrl+4', desc: 'View 4 — leaderboard' },
				{ key: 'Ctrl+5', desc: 'View 5 — x86sim (PC emulator)' },
				{ key: 'T', desc: 'Cycle theme (tokyo / gruvbox / nord / amber)' },
				{ key: '`', desc: 'Drop-down console — same as the ~ button, top-left' },
				{ key: '? or F1', desc: 'This reference' },
				{ key: 'guide', desc: 'Console command (or the [?] button) for the walkthrough' },
				{ key: 'Esc', desc: 'Close the console overlay or this panel' }
			]
		},
		{
			title: 'CONSOLE',
			color: '#98c379',
			note: 'Type "help" for commands, "man <cmd>" for one of them',
			keys: [
				{ key: 'Tab', desc: 'Complete, then cycle through candidates' },
				{ key: '→ / End', desc: 'Accept the inline ghost completion' },
				{ key: '↑ / ↓', desc: 'Walk command history (persisted)' },
				{ key: 'Ctrl+L', desc: 'Clear the screen' },
				{ key: 'Esc', desc: 'Clear the current input line' },
				{ key: '|', desc: 'Pipe into grep / head / tail / sort / uniq / wc' }
			]
		},
		{
			title: 'SYNTH — QWERTY PIANO',
			color: '#c678dd',
			note: 'Active on view 2 whenever no text field has focus',
			keys: [
				{ key: 'Z S X D C V G B H N J M , L .', desc: 'Lower octave, white + black keys' },
				{ key: 'Q 2 W 3 E R 5 T 6 Y 7 U I 9 O 0 P', desc: 'Upper octave' },
				{ key: 'Ctrl / Shift', desc: 'Octave down / up (also [ and ])' },
				{ key: 'Space', desc: 'Sustain pedal — momentary, held = pedal down' }
			]
		}
	];
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-[160] bg-black/70 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-2 sm:p-6 overflow-y-auto" onclick={onClose}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="w-full max-w-3xl {themeStyles.cardBg} border {themeStyles.border} rounded-sm shadow-[0_16px_48px_rgba(0,0,0,0.8)] font-mono my-auto"
		onclick={(e) => e.stopPropagation()}
	>
		<div class="flex items-center justify-between px-3 py-2 border-b {themeStyles.border} {themeStyles.headerBg} rounded-t-sm">
			<span class="text-xs sm:text-sm font-black" style="color: {themeStyles.cursorColor}">┌─[ KEYMAP // KRSZ.IN ]─┐</span>
			<button onclick={onClose} class="text-xs text-white/50 hover:text-white cursor-pointer">[ Esc ]</button>
		</div>

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
