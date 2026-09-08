<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { playSound } from '../../sound';
	import { resolvedTheme, THEME_STYLES } from '../../stores/theme';
	import { pulseStep } from '../../stores/clock';
	import {
		consoleBuffer,
		commandHistory,
		cwd,
		executeCommand,
		getSuggestions,
		applyCompletion,
		cancelActiveAnimation,
		cancelConsoleAnimation,
		type LineKind
	} from '../../stores/console';

	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);

	let commandInput = $state('');
	let inputEl: HTMLInputElement | undefined = $state();
	let focused = $state(false);
	const inputId = $props.id();
	let scrollEl: HTMLDivElement | undefined = $state();
	/** null = editing a fresh line; otherwise index into commandHistory being recalled. */
	let historyIdx = $state<number | null>(null);
	/** Tab-cycle: base input at first Tab + the match list it produced. */
	let tabCycle: { base: string; matches: string[]; idx: number } | null = null;

	let suggestions = $derived(commandInput ? getSuggestions(commandInput) : []);
	let lastToken = $derived(commandInput.split(/\s+/).pop() ?? '');
	/** Inline ghost: the untyped remainder of the top suggestion. */
	let ghost = $derived(
		suggestions.length > 0 && lastToken && suggestions[0] !== lastToken
			? suggestions[0].slice(lastToken.length)
			: ''
	);

	const LINE_CLASS: Record<LineKind, string> = {
		cmd: 'text-white/60',
		out: 'text-[#d8dee9]/90',
		ok: 'text-[#98c379]',
		err: 'text-[#e06c75]',
		accent: 'text-[#56b6c2] font-bold',
		gold: 'text-[#e5c07b] font-bold'
	};

	// The console is a drop-down now, so it is opened deliberately — put the caret
	// in it rather than making the user click. Focusing here (instead of the
	// autofocus attribute) is legitimate for the same reason and keeps the
	// element free of a lint ignore: this mounts into an already-loaded page,
	// on demand, as an overlay -- not on initial page load.
	onMount(() => {
		const id = requestAnimationFrame(() => inputEl?.focus());
		return () => {
			cancelAnimationFrame(id);
			// A closed/unmounted console must not leave `sl`'s scroll animation
			// running against a scrollback buffer nobody is looking at.
			cancelConsoleAnimation();
		};
	});

	// Keep the scrollback pinned to the newest line.
	$effect(() => {
		$consoleBuffer;
		if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
	});

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		const raw = commandInput.trim();
		if (!raw) return;
		playSound('keystroke', 'enter');
		executeCommand(raw);
		commandInput = '';
		historyIdx = null;
		tabCycle = null;
	}

	function pickSuggestion(s: string) {
		commandInput = applyCompletion(commandInput, s);
		tabCycle = null;
		inputEl?.focus();
		playSound('click');
	}

	function handleTab() {
		if (tabCycle && tabCycle.matches.length > 1) {
			tabCycle.idx = (tabCycle.idx + 1) % tabCycle.matches.length;
			commandInput = applyCompletion(tabCycle.base, tabCycle.matches[tabCycle.idx], false);
			return;
		}
		const matches = getSuggestions(commandInput);
		if (matches.length === 0) return;
		if (matches.length === 1) {
			commandInput = applyCompletion(commandInput, matches[0]);
			tabCycle = null;
			return;
		}
		tabCycle = { base: commandInput, matches, idx: 0 };
		commandInput = applyCompletion(commandInput, matches[0], false);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			const h = $commandHistory;
			if (h.length === 0) return;
			historyIdx = historyIdx === null ? h.length - 1 : Math.max(0, historyIdx - 1);
			commandInput = h[historyIdx];
			tabCycle = null;
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			const h = $commandHistory;
			if (historyIdx === null) return;
			if (historyIdx >= h.length - 1) {
				historyIdx = null;
				commandInput = '';
			} else {
				historyIdx = historyIdx + 1;
				commandInput = h[historyIdx];
			}
			tabCycle = null;
			return;
		}
		if (e.key === 'Tab') {
			e.preventDefault();
			handleTab();
			return;
		}
		if (e.key === 'ArrowRight' || e.key === 'End') {
			// Accept the inline ghost when the caret is already at the end.
			if (ghost && inputEl && inputEl.selectionStart === commandInput.length) {
				e.preventDefault();
				commandInput = applyCompletion(commandInput, suggestions[0]);
				tabCycle = null;
			}
			return;
		}
		if (e.key === 'Escape') {
			// Esc cancels a running animation (`sl`) first -- only clears the
			// input line once nothing is scrolling.
			const cancel = $cancelActiveAnimation;
			if (cancel) {
				e.preventDefault();
				cancel();
				return;
			}
			commandInput = '';
			historyIdx = null;
			tabCycle = null;
			return;
		}
		if (e.key === 'c' && e.ctrlKey) {
			const cancel = $cancelActiveAnimation;
			if (cancel) {
				e.preventDefault();
				cancel();
			}
			return;
		}
		if (e.key === 'l' && e.ctrlKey) {
			e.preventDefault();
			consoleBuffer.set([]);
			return;
		}
		historyIdx = null;
		tabCycle = null;
	}
</script>

<div class="border-t border-white/10 pt-2 space-y-1.5 shrink-0">
	<!-- Scrollback -->
	<div
		bind:this={scrollEl}
		role="log"
		aria-live="polite"
		aria-label={$t('chrome.console.scrollbackLabel')}
		tabindex="0"
		class="min-h-[3rem] max-h-[55vh] overflow-y-auto custom-scrollbar scroll-instant font-mono text-[13px] leading-relaxed pr-1"
	>
		{#each $consoleBuffer as line, i (i)}
			<div class="whitespace-pre-wrap break-words {LINE_CLASS[line.kind]}">
				{#if line.kind === 'cmd'}<span style="color: {themeStyles.cursorColor}">$ </span>{/if}{line.text}
			</div>
		{/each}
	</div>

	<!-- Live completion bar: matches for the current token, click or Tab-cycle to apply -->
	{#if suggestions.length > 0 && !(suggestions.length === 1 && suggestions[0] === lastToken)}
		<div class="flex items-center gap-1 flex-wrap font-mono text-xs">
			<span class="text-white/50 select-none">⇥</span>
			{#each suggestions.slice(0, 12) as s (s)}
				<button
					type="button"
					onclick={() => pickSuggestion(s)}
					class="press px-1.5 py-0.5 border border-white/15 bg-black/40 hover:border-[#56b6c2] hover:text-[#56b6c2] text-white/60 rounded-xs cursor-pointer transition-colors"
				>
					{s}
				</button>
			{/each}
			{#if suggestions.length > 12}
				<span class="text-white/50">{$t('chrome.console.moreSuggestions', { count: suggestions.length - 12 })}</span>
			{/if}
		</div>
	{/if}

	<!-- Clicking anywhere in the bar focuses the input underneath -- the label
	     wraps the whole bar so that is a native label/for relationship instead
	     of a click handler on a non-interactive element. -->
	<form
		onsubmit={handleSubmit}
		class="flex items-center gap-2 sm:gap-2.5 border bg-black/60 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xs relative min-h-[40px] sm:min-h-[42px] max-w-full transition-colors {focused
			? 'border-white/60 bg-black/80'
			: 'border-white/20'}"
	>
		{#if $cwd !== '/'}
			<span class="font-mono text-xs sm:text-sm text-white/60 select-none shrink-0 hidden sm:inline">{$cwd}</span>
		{/if}
		<span class="font-black text-sm select-none" style="color: {themeStyles.cursorColor}">:</span>

		<label for={inputId} class="relative flex-1 flex items-center font-mono text-sm sm:text-base text-[#eceff4] min-h-[24px] overflow-hidden cursor-text">
			<span aria-hidden="true" class="whitespace-pre">{commandInput}</span>
			<span
				aria-hidden="true"
				class="inline-block w-[9px] h-[18px] shrink-0 transition-opacity duration-75"
				style="background-color: {themeStyles.cursorColor}; opacity: {!focused
					? 0.2
					: $pulseStep % 6 < 4
						? 0.95
						: 0.15};"
			></span>
			{#if ghost}
				<span aria-hidden="true" class="whitespace-pre text-white/50 select-none pointer-events-none">{ghost}</span>
			{/if}
			{#if !commandInput}
				<span aria-hidden="true" class="text-xs text-white/50 ml-1.5 sm:ml-2 select-none pointer-events-none truncate block">
					{$t('chrome.console.inputHint')}
				</span>
			{/if}

			<input
				bind:this={inputEl}
				id={inputId}
				type="text"
				bind:value={commandInput}
				onkeydown={handleKeydown}
				onfocus={() => (focused = true)}
				onblur={() => (focused = false)}
				aria-label={$t('chrome.console.inputLabel')}
				autocomplete="off"
				class="absolute inset-0 w-full h-full opacity-0 cursor-text outline-none font-mono z-10"
			/>
		</label>

		<button type="submit" class="press text-xs sm:text-sm uppercase font-bold cursor-pointer z-20 hover:opacity-80 transition-opacity" style="color: {themeStyles.cursorColor}">
			[{$t('chrome.console.exec')}]
		</button>
	</form>
</div>
