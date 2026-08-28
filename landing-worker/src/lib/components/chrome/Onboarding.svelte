<script lang="ts">
	import { goto } from '$app/navigation';
	import { playSound } from '../../sound';
	import { theme, THEME_STYLES } from '../../stores/theme';
	import { TAB_ROUTES } from '../../routes-map';
	import { consoleOverlayOpen, hotkeyOverlayOpen } from '../../stores/chrome';

	let { onClose }: { onClose: () => void } = $props();

	let themeStyles = $derived(THEME_STYLES[$theme]);

	interface Row {
		key?: string;
		label: string;
		desc: string;
		color?: string;
		/** Optional action that demonstrates the step instead of describing it. */
		action?: { label: string; run: () => void };
	}

	interface Step {
		title: string;
		lead: string;
		rows: Row[];
		footer?: string;
	}

	/** Every claim here mirrors what the code actually does — see +layout.svelte and console.ts. */
	const STEPS: Step[] = [
		{
			title: 'WHAT THIS IS',
			lead: 'A workbench for the things running on krsz.in, laid out like a tmux session. Five views, one shared console, and nothing decorative: every number you see is either measured in your browser or read from the service it describes.',
			rows: [
				{ label: 'RUNTIME', desc: 'Fully prerendered SvelteKit, served as static assets from a Cloudflare Worker', color: '#56b6c2' },
				{ label: 'OPERATOR', desc: 'kurashizu — IT Masters @ UNSW, Sydney', color: '#61afef' },
				{ label: 'RULE', desc: 'No invented metrics. Anything the browser will not tell us prints "n/a".', color: '#98c379' }
			]
		},
		{
			title: 'THE FIVE VIEWS',
			lead: 'Switch with the tabs along the top, the launchpad in the sidebar, or Ctrl and a digit — the keys work even inside the keyboard tester and the piano.',
			rows: [
				{ key: 'Ctrl+0', label: 'MODULES', desc: 'Every live subdomain, with verified facts and a real architecture diagram', color: '#56b6c2' },
				{ key: 'Ctrl+1', label: 'GUESTBOOK', desc: "Posts a message to blog.krsz.in's guestbook API", color: '#e06c75' },
				{ key: 'Ctrl+2', label: 'SYNTH', desc: '8-track WebAudio synth: sequencer, piano roll, MIDI in, .mid import, WAV bounce', color: '#c678dd' },
				{ key: 'Ctrl+3', label: 'UTILITIES', desc: 'Twelve hardware testers — keyboard, mouse, pen, audio in/out, camera, screen, network', color: '#e5c07b' },
				{ key: 'Ctrl+4', label: 'LEADERBOARD', desc: 'The Artificial Analysis language-model table, sortable seven ways', color: '#98c379' }
			]
		},
		{
			title: 'THE CONSOLE',
			lead: 'A small shell, opened as a drop-down over whatever view you are on. It is not a prop: the filesystem is a live projection of this site’s own data.',
			rows: [
				{ key: '`', label: 'OPEN', desc: 'Backquote from anywhere, or the ~ CONSOLE button top-left', color: '#98c379' },
				{ key: 'help', label: 'COMMANDS', desc: 'The full list; "man <cmd>" explains one of them', color: '#56b6c2' },
				{ key: 'ls / cd / cat', label: 'FILESYSTEM', desc: 'Browse /projects, /operator, /synth, /edge — try "cat /projects/share/facts.txt"', color: '#e5c07b' },
				{ key: '|', label: 'PIPES', desc: 'grep, head, tail, sort, uniq, wc — "cat /projects/index | grep tube"', color: '#c678dd' },
				{ key: 'trace', label: 'EDGE', desc: 'The Cloudflare PoP actually serving you, with a measured round trip', color: '#61afef' },
				{ key: 'ping <name>', label: 'LATENCY', desc: 'Real round trips from your browser to each project origin', color: '#e06c75' }
			],
			footer: 'Tab completes and cycles, → accepts the ghost suggestion, ↑↓ walk a history that survives reloads.'
		},
		{
			title: 'EVERY SHORTCUT',
			lead: 'These work globally. The synth adds a QWERTY piano on top — press ? any time for the complete map.',
			rows: [
				{ key: 'Ctrl+0…4', label: 'VIEWS', desc: 'Switch view, always, from anywhere' },
				{ key: '`', label: 'CONSOLE', desc: 'Toggle the drop-down console', color: '#98c379' },
				{ key: '? / F1', label: 'KEYMAP', desc: 'The full reference, including the piano keys', color: '#61afef' },
				{ key: 'T', label: 'THEME', desc: 'Cycle tokyo / gruvbox / nord / amber', color: '#e5c07b' },
				{ key: 'Esc', label: 'CLOSE', desc: 'Dismiss whichever overlay is open' }
			]
		}
	];

	let index = $state(0);
	let step = $derived(STEPS[index]);
	let isLast = $derived(index === STEPS.length - 1);

	function next() {
		if (isLast) {
			onClose();
			return;
		}
		index++;
		playSound('click');
	}

	function back() {
		if (index === 0) return;
		index--;
		playSound('click');
	}

	function finishAnd(run: () => void) {
		onClose();
		run();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-[170] bg-black/75 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-2 sm:p-6 overflow-y-auto" onclick={onClose}>
	<div
		class="w-full max-w-2xl {themeStyles.cardBg} border {themeStyles.border} rounded-sm shadow-[0_16px_48px_rgba(0,0,0,0.85)] font-mono my-auto"
		onclick={(e) => e.stopPropagation()}
	>
		<div class="flex items-center justify-between px-3 py-2 border-b {themeStyles.border} {themeStyles.headerBg} rounded-t-sm">
			<span class="text-xs sm:text-sm font-black" style="color: {themeStyles.cursorColor}">
				┌─[ GETTING STARTED · {index + 1}/{STEPS.length} ]─┐
			</span>
			<button onclick={onClose} class="text-xs text-white/50 hover:text-white cursor-pointer">[ SKIP ]</button>
		</div>

		<div class="p-3 sm:p-4 space-y-3">
			<div>
				<div class="text-sm sm:text-base font-black tracking-wide" style="color: {themeStyles.cursorColor}">{step.title}</div>
				<p class="text-[11px] sm:text-xs text-white/60 leading-relaxed mt-1">{step.lead}</p>
			</div>

			<div class="space-y-1 max-h-[46vh] overflow-y-auto custom-scrollbar pr-1">
				{#each step.rows as row (row.label)}
					<div class="flex items-baseline gap-2 sm:gap-3 border border-white/10 bg-black/30 rounded-xs px-2 py-1.5">
						{#if row.key}
							<kbd
								class="shrink-0 px-1.5 py-0.5 rounded-xs border bg-black/50 text-[10px] sm:text-xs font-bold whitespace-nowrap min-w-[74px] text-center"
								style="border-color: {row.color ?? '#8892a0'}66; color: {row.color ?? '#d8dee9'}"
							>
								{row.key}
							</kbd>
						{/if}
						<span class="shrink-0 text-[10px] sm:text-xs font-bold w-[84px] sm:w-[104px]" style="color: {row.color ?? '#d8dee9'}">
							{row.label}
						</span>
						<span class="text-[11px] sm:text-xs text-white/65 leading-snug">{row.desc}</span>
					</div>
				{/each}
			</div>

			{#if step.footer}
				<p class="text-[10px] sm:text-[11px] text-white/40 leading-relaxed">{step.footer}</p>
			{/if}
		</div>

		<div class="flex items-center justify-between gap-2 px-3 py-2 border-t {themeStyles.border} {themeStyles.headerBg} rounded-b-sm">
			<div class="flex items-center gap-1.5">
				{#each STEPS as s, i (s.title)}
					<button
						onclick={() => (index = i)}
						aria-label={`Step ${i + 1}: ${s.title}`}
						class="w-2 h-2 rounded-full cursor-pointer transition-colors {i === index ? '' : 'bg-white/20 hover:bg-white/40'}"
						style={i === index ? `background-color: ${themeStyles.cursorColor}` : undefined}
					></button>
				{/each}
			</div>

			<div class="flex items-center gap-1.5">
				{#if isLast}
					<button
						onclick={() => finishAnd(() => consoleOverlayOpen.set(true))}
						class="px-2.5 py-1 border border-[#98c379]/50 text-[#98c379] rounded-xs text-xs font-bold cursor-pointer hover:bg-[#98c379]/20"
					>
						OPEN CONSOLE
					</button>
					<button
						onclick={() => finishAnd(() => hotkeyOverlayOpen.set(true))}
						class="px-2.5 py-1 border border-[#61afef]/50 text-[#61afef] rounded-xs text-xs font-bold cursor-pointer hover:bg-[#61afef]/20 hidden sm:inline"
					>
						FULL KEYMAP
					</button>
				{:else if index === 1}
					<button
						onclick={() => finishAnd(() => goto(TAB_ROUTES[2]))}
						class="px-2.5 py-1 border border-[#c678dd]/50 text-[#c678dd] rounded-xs text-xs font-bold cursor-pointer hover:bg-[#c678dd]/20 hidden sm:inline"
					>
						JUMP TO SYNTH
					</button>
				{/if}
				<button
					onclick={back}
					disabled={index === 0}
					class="px-2.5 py-1 border border-white/25 text-white/70 rounded-xs text-xs font-bold cursor-pointer hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
				>
					BACK
				</button>
				<button
					onclick={next}
					class="px-3 py-1 border rounded-xs text-xs font-black cursor-pointer transition-colors"
					style="border-color: {themeStyles.cursorColor}; color: {themeStyles.cursorColor}"
				>
					{isLast ? 'START' : 'NEXT'}
				</button>
			</div>
		</div>
	</div>
</div>
