<script lang="ts">
	import { playSound } from '../../sound';
	import { theme, THEME_STYLES } from '../../stores/theme';
	import { pulseStep } from '../../stores/clock';
	import { consoleBuffer, commandHistory, executeCommand, completeCommand, type LineKind } from '../../stores/console';

	let themeStyles = $derived(THEME_STYLES[$theme]);

	let commandInput = $state('');
	let inputEl: HTMLInputElement | undefined = $state();
	let scrollEl: HTMLDivElement | undefined = $state();
	/** null = editing a fresh line; otherwise index into commandHistory being recalled. */
	let historyIdx = $state<number | null>(null);

	const LINE_CLASS: Record<LineKind, string> = {
		cmd: 'text-white/45',
		out: 'text-[#d8dee9]/90',
		ok: 'text-[#98c379]',
		err: 'text-[#e06c75]',
		accent: 'text-[#56b6c2] font-bold',
		gold: 'text-[#e5c07b] font-bold'
	};

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
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			const h = $commandHistory;
			if (h.length === 0) return;
			historyIdx = historyIdx === null ? h.length - 1 : Math.max(0, historyIdx - 1);
			commandInput = h[historyIdx];
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
			return;
		}
		if (e.key === 'Tab') {
			e.preventDefault();
			const completed = completeCommand(commandInput);
			if (completed !== null) commandInput = completed;
			return;
		}
		if (e.key === 'Escape') {
			commandInput = '';
			historyIdx = null;
			return;
		}
		if (e.key === 'l' && e.ctrlKey) {
			e.preventDefault();
			consoleBuffer.set([]);
			return;
		}
		historyIdx = null;
	}
</script>

<div class="border-t border-white/10 pt-2 space-y-1.5 shrink-0">
	<!-- Scrollback -->
	<div bind:this={scrollEl} class="max-h-40 overflow-y-auto custom-scrollbar font-mono text-xs leading-relaxed pr-1">
		{#each $consoleBuffer as line, i (i)}
			<div class="whitespace-pre-wrap break-words {LINE_CLASS[line.kind]}">
				{#if line.kind === 'cmd'}<span style="color: {themeStyles.cursorColor}">$ </span>{/if}{line.text}
			</div>
		{/each}
	</div>

	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<form
		onsubmit={handleSubmit}
		onclick={() => inputEl?.focus()}
		class="flex items-center gap-2 sm:gap-2.5 border border-white/25 bg-black/60 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xs cursor-text relative min-h-[40px] sm:min-h-[42px] max-w-full"
	>
		<span class="font-black text-sm select-none" style="color: {themeStyles.cursorColor}">:</span>

		<div class="relative flex-1 flex items-center font-mono text-sm sm:text-base text-[#eceff4] min-h-[24px] overflow-hidden">
			<span class="whitespace-pre">{commandInput}</span>
			<span
				class="inline-block w-[9px] h-[18px] ml-0.5 align-middle shrink-0 transition-opacity duration-75"
				style="background-color: {themeStyles.cursorColor}; opacity: {$pulseStep % 6 < 4 ? 0.95 : 0.15};"
			></span>
			{#if !commandInput}
				<span class="text-xs opacity-40 ml-1.5 sm:ml-2 select-none pointer-events-none truncate block">
					Type "help" — Tab completes, ↑↓ history, Ctrl+L clears...
				</span>
			{/if}

			<!-- svelte-ignore a11y_autofocus -->
			<input
				bind:this={inputEl}
				type="text"
				bind:value={commandInput}
				onkeydown={handleKeydown}
				class="absolute inset-0 w-full h-full opacity-0 cursor-text outline-none font-mono z-10"
				autofocus
			/>
		</div>

		<button type="submit" class="text-xs sm:text-sm uppercase font-bold cursor-pointer z-20 hover:opacity-80" style="color: {themeStyles.cursorColor}">
			[EXEC]
		</button>
	</form>
</div>
