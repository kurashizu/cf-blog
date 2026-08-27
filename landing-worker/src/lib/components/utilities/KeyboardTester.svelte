<script lang="ts">
	import { onMount } from 'svelte';
	import { playSound } from '../../sound';
	import { theme, THEME_STYLES } from '../../stores/theme';
	import { suspendNavHotkeys } from '../../stores/hotkeys';
	import { SvelteSet } from 'svelte/reactivity';

	let themeStyles = $derived(THEME_STYLES[$theme]);

	interface KeyDef {
		code: string;
		label: string;
		w: number;
	}

	// ANSI TKL-ish board + nav/arrow block. w = key width in "units".
	const MAIN_ROWS: KeyDef[][] = [
		[
			{ code: 'Escape', label: 'ESC', w: 1 },
			...Array.from({ length: 12 }, (_, i) => ({ code: `F${i + 1}`, label: `F${i + 1}`, w: 1 }))
		],
		[
			{ code: 'Backquote', label: '`', w: 1 },
			...'1234567890'.split('').map((d) => ({ code: `Digit${d}`, label: d, w: 1 })),
			{ code: 'Minus', label: '-', w: 1 },
			{ code: 'Equal', label: '=', w: 1 },
			{ code: 'Backspace', label: '⌫', w: 2 }
		],
		[
			{ code: 'Tab', label: 'TAB', w: 1.5 },
			...'QWERTYUIOP'.split('').map((c) => ({ code: `Key${c}`, label: c, w: 1 })),
			{ code: 'BracketLeft', label: '[', w: 1 },
			{ code: 'BracketRight', label: ']', w: 1 },
			{ code: 'Backslash', label: '\\', w: 1.5 }
		],
		[
			{ code: 'CapsLock', label: 'CAPS', w: 1.75 },
			...'ASDFGHJKL'.split('').map((c) => ({ code: `Key${c}`, label: c, w: 1 })),
			{ code: 'Semicolon', label: ';', w: 1 },
			{ code: 'Quote', label: "'", w: 1 },
			{ code: 'Enter', label: '⏎ ENTER', w: 2.25 }
		],
		[
			{ code: 'ShiftLeft', label: '⇧ SHIFT', w: 2.25 },
			...'ZXCVBNM'.split('').map((c) => ({ code: `Key${c}`, label: c, w: 1 })),
			{ code: 'Comma', label: ',', w: 1 },
			{ code: 'Period', label: '.', w: 1 },
			{ code: 'Slash', label: '/', w: 1 },
			{ code: 'ShiftRight', label: '⇧ SHIFT', w: 2.75 }
		],
		[
			{ code: 'ControlLeft', label: 'CTRL', w: 1.25 },
			{ code: 'MetaLeft', label: 'META', w: 1.25 },
			{ code: 'AltLeft', label: 'ALT', w: 1.25 },
			{ code: 'Space', label: 'SPACE', w: 6.25 },
			{ code: 'AltRight', label: 'ALT', w: 1.25 },
			{ code: 'MetaRight', label: 'META', w: 1.25 },
			{ code: 'ContextMenu', label: 'MENU', w: 1.25 },
			{ code: 'ControlRight', label: 'CTRL', w: 1.25 }
		]
	];

	const NAV_ROWS: KeyDef[][] = [
		[
			{ code: 'Insert', label: 'INS', w: 1 },
			{ code: 'Home', label: 'HOME', w: 1 },
			{ code: 'PageUp', label: 'PGUP', w: 1 }
		],
		[
			{ code: 'Delete', label: 'DEL', w: 1 },
			{ code: 'End', label: 'END', w: 1 },
			{ code: 'PageDown', label: 'PGDN', w: 1 }
		],
		[
			{ code: '', label: '', w: 1 },
			{ code: 'ArrowUp', label: '▲', w: 1 },
			{ code: '', label: '', w: 1 }
		],
		[
			{ code: 'ArrowLeft', label: '◀', w: 1 },
			{ code: 'ArrowDown', label: '▼', w: 1 },
			{ code: 'ArrowRight', label: '▶', w: 1 }
		]
	];

	const pressed = new SvelteSet<string>();
	const tested = new SvelteSet<string>();
	let maxRollover = $state(0);
	let eventCount = $state(0);
	let last = $state<{ key: string; code: string; keyCode: number; location: number; repeat: boolean } | null>(null);

	function handleKeydown(e: KeyboardEvent) {
		// Keep browser side effects (space-scroll, quick-find, tab focus jumps) out of the test.
		e.preventDefault();
		if (!e.repeat) {
			pressed.add(e.code);
			tested.add(e.code);
			eventCount++;
			maxRollover = Math.max(maxRollover, pressed.size);
		}
		last = { key: e.key === ' ' ? 'Space' : e.key, code: e.code, keyCode: e.keyCode, location: e.location, repeat: e.repeat };
	}

	function handleKeyup(e: KeyboardEvent) {
		e.preventDefault();
		pressed.delete(e.code);
	}

	function handleBlur() {
		// Guard against stuck keys when focus leaves the page (e.g. Cmd+Tab).
		pressed.clear();
	}

	function reset() {
		pressed.clear();
		tested.clear();
		maxRollover = 0;
		eventCount = 0;
		last = null;
		playSound('click');
	}

	onMount(() => {
		suspendNavHotkeys.set(true);
		window.addEventListener('keydown', handleKeydown);
		window.addEventListener('keyup', handleKeyup);
		window.addEventListener('blur', handleBlur);
		return () => {
			suspendNavHotkeys.set(false);
			window.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('keyup', handleKeyup);
			window.removeEventListener('blur', handleBlur);
		};
	});

	function keyClass(code: string): string {
		if (!code) return 'invisible';
		if (pressed.has(code)) return 'text-black font-black';
		if (tested.has(code)) return 'border-[#98c379]/70 text-[#98c379] bg-[#98c379]/10';
		return 'border-white/15 text-white/50 bg-black/40';
	}
</script>

<div class="space-y-2">
	<!-- Readout strip -->
	<div class="flex flex-wrap items-center gap-1.5 text-xs font-mono">
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs">
			<span class="text-white/50">KEY:</span>
			<span class="font-black" style="color: {themeStyles.cursorColor}">{last?.key ?? '—'}</span>
		</span>
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs">
			<span class="text-white/50">CODE:</span>
			<span class="text-[#e5c07b] font-bold">{last?.code ?? '—'}</span>
		</span>
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs">
			<span class="text-white/50">keyCode:</span>
			<span class="text-[#c678dd] font-bold">{last?.keyCode ?? '—'}</span>
		</span>
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs" title="0 standard · 1 left · 2 right · 3 numpad">
			<span class="text-white/50">LOC:</span>
			<span class="text-white/80 font-bold">{last?.location ?? '—'}</span>
		</span>
		<span class="px-2 py-1 border border-[#56b6c2]/40 bg-[#56b6c2]/10 rounded-xs text-[#56b6c2]" title="Highest number of keys held simultaneously — OS/hardware may cap this (ghosting/NKRO limit)">
			ROLLOVER MAX: <span class="font-black">{maxRollover}</span>
		</span>
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60">
			TESTED: <span class="text-[#98c379] font-bold">{tested.size}</span> · DOWN NOW: <span class="font-bold" style="color: {themeStyles.cursorColor}">{pressed.size}</span>
		</span>
		<button onclick={reset} class="ml-auto px-2 py-1 border border-white/20 hover:border-[#e06c75] text-white/60 hover:text-[#e06c75] rounded-xs font-bold cursor-pointer transition-colors">
			✕ RESET
		</button>
	</div>

	<!-- Keyboard -->
	<div class="overflow-x-auto custom-scrollbar">
		<div class="min-w-[720px] flex gap-2">
			<div class="flex-1 flex flex-col gap-1">
				{#each MAIN_ROWS as row, ri (ri)}
					<div class="flex gap-1">
						{#each row as k, ki (ki)}
							<div
								class="border rounded-xs h-9 flex items-center justify-center text-[10px] font-mono font-bold transition-colors duration-75 select-none {keyClass(k.code)}"
								style="flex: {k.w} 1 0%; {pressed.has(k.code) ? `background-color: ${themeStyles.cursorColor}; border-color: ${themeStyles.cursorColor};` : ''}"
							>
								{k.label}
							</div>
						{/each}
					</div>
				{/each}
			</div>
			<div class="w-[132px] shrink-0 flex flex-col gap-1">
				{#each NAV_ROWS as row, ri (ri)}
					<div class="flex gap-1">
						{#each row as k, ki (ki)}
							<div
								class="border rounded-xs h-9 flex-1 flex items-center justify-center text-[10px] font-mono font-bold transition-colors duration-75 select-none {keyClass(k.code)}"
								style={pressed.has(k.code) ? `background-color: ${themeStyles.cursorColor}; border-color: ${themeStyles.cursorColor};` : ''}
							>
								{k.label}
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-white/40">
		<span>Press any key — green = tested, highlighted = held. Nav hotkeys (Ctrl+0-3, T) are paused on this tool.</span>
		<span class="ml-auto">Keys pressed: {eventCount}</span>
	</div>
</div>
