<script lang="ts">
	/**
	 * An on-screen keyboard that sends PS/2 set-1 scancodes straight to the guest.
	 *
	 * This exists for phones, where the software IME cannot usefully drive a
	 * terminal, but it is also more correct than typing on a physical keyboard:
	 * v86 maps browser key events through an assumed US layout, so a non-US
	 * layout mistypes punctuation. Scancodes bypass that entirely.
	 */
	let {
		send,
		onClose
	}: {
		send: (scancodes: number[]) => void;
		onClose?: () => void;
	} = $props();

	interface Key {
		/** Unshifted / shifted labels. */
		label: string;
		shifted?: string;
		/** Set-1 make code; the break code is `make | 0x80`. */
		code: number;
		/** Grid width in units of one standard key. */
		width?: number;
	}

	const ROW_1: Key[] = [
		{ label: '`', shifted: '~', code: 0x29 },
		{ label: '1', shifted: '!', code: 0x02 },
		{ label: '2', shifted: '@', code: 0x03 },
		{ label: '3', shifted: '#', code: 0x04 },
		{ label: '4', shifted: '$', code: 0x05 },
		{ label: '5', shifted: '%', code: 0x06 },
		{ label: '6', shifted: '^', code: 0x07 },
		{ label: '7', shifted: '&', code: 0x08 },
		{ label: '8', shifted: '*', code: 0x09 },
		{ label: '9', shifted: '(', code: 0x0a },
		{ label: '0', shifted: ')', code: 0x0b },
		{ label: '-', shifted: '_', code: 0x0c },
		{ label: '=', shifted: '+', code: 0x0d },
		{ label: '⌫', code: 0x0e, width: 2 }
	];

	const ROW_2: Key[] = [
		{ label: '⇥', code: 0x0f, width: 1.5 },
		{ label: 'q', shifted: 'Q', code: 0x10 },
		{ label: 'w', shifted: 'W', code: 0x11 },
		{ label: 'e', shifted: 'E', code: 0x12 },
		{ label: 'r', shifted: 'R', code: 0x13 },
		{ label: 't', shifted: 'T', code: 0x14 },
		{ label: 'y', shifted: 'Y', code: 0x15 },
		{ label: 'u', shifted: 'U', code: 0x16 },
		{ label: 'i', shifted: 'I', code: 0x17 },
		{ label: 'o', shifted: 'O', code: 0x18 },
		{ label: 'p', shifted: 'P', code: 0x19 },
		{ label: '[', shifted: '{', code: 0x1a },
		{ label: ']', shifted: '}', code: 0x1b },
		{ label: '\\', shifted: '|', code: 0x2b, width: 1.5 }
	];

	const ROW_3: Key[] = [
		{ label: 'a', shifted: 'A', code: 0x1e },
		{ label: 's', shifted: 'S', code: 0x1f },
		{ label: 'd', shifted: 'D', code: 0x20 },
		{ label: 'f', shifted: 'F', code: 0x21 },
		{ label: 'g', shifted: 'G', code: 0x22 },
		{ label: 'h', shifted: 'H', code: 0x23 },
		{ label: 'j', shifted: 'J', code: 0x24 },
		{ label: 'k', shifted: 'K', code: 0x25 },
		{ label: 'l', shifted: 'L', code: 0x26 },
		{ label: ';', shifted: ':', code: 0x27 },
		{ label: "'", shifted: '"', code: 0x28 },
		{ label: '⏎', code: 0x1c, width: 2 }
	];

	const ROW_4: Key[] = [
		{ label: 'z', shifted: 'Z', code: 0x2c },
		{ label: 'x', shifted: 'X', code: 0x2d },
		{ label: 'c', shifted: 'C', code: 0x2e },
		{ label: 'v', shifted: 'V', code: 0x2f },
		{ label: 'b', shifted: 'B', code: 0x30 },
		{ label: 'n', shifted: 'N', code: 0x31 },
		{ label: 'm', shifted: 'M', code: 0x32 },
		{ label: ',', shifted: '<', code: 0x33 },
		{ label: '.', shifted: '>', code: 0x34 },
		{ label: '/', shifted: '?', code: 0x35 },
		{ label: '↑', code: 0x48 },
		{ label: '␣', code: 0x39, width: 2 }
	];

	/** Sticky modifiers: tap to arm, tap again to release, long-press to lock. */
	let shift = $state(false);
	let ctrl = $state(false);
	let alt = $state(false);
	let shiftLocked = $state(false);
	let ctrlLocked = $state(false);

	const MAKE = { shift: 0x2a, ctrl: 0x1d, alt: 0x38 };

	function press(key: Key) {
		const prefix: number[] = [];
		const suffix: number[] = [];
		if (shift) {
			prefix.push(MAKE.shift);
			suffix.unshift(MAKE.shift | 0x80);
		}
		if (ctrl) {
			prefix.push(MAKE.ctrl);
			suffix.unshift(MAKE.ctrl | 0x80);
		}
		if (alt) {
			prefix.push(MAKE.alt);
			suffix.unshift(MAKE.alt | 0x80);
		}

		// Arrow keys and other greys are extended codes, prefixed with 0xE0.
		const extended = key.code === 0x48 || key.code === 0x50 || key.code === 0x4b || key.code === 0x4d;
		const make = extended ? [0xe0, key.code] : [key.code];
		const brk = extended ? [0xe0, key.code | 0x80] : [key.code | 0x80];

		send([...prefix, ...make, ...brk, ...suffix]);

		if (!shiftLocked) shift = false;
		if (!ctrlLocked) ctrl = false;
		alt = false;
	}

	function toggleShift() {
		if (shift && !shiftLocked) {
			shiftLocked = true;
		} else if (shiftLocked) {
			shiftLocked = false;
			shift = false;
		} else {
			shift = true;
		}
	}

	function toggleCtrl() {
		if (ctrl && !ctrlLocked) {
			ctrlLocked = true;
		} else if (ctrlLocked) {
			ctrlLocked = false;
			ctrl = false;
		} else {
			ctrl = true;
		}
	}

	const ROWS = [ROW_1, ROW_2, ROW_3, ROW_4];

	/** Sequences worth one tap in a shell. */
	const MACROS: { label: string; codes: number[]; title: string }[] = [
		{ label: '^C', codes: [0x1d, 0x2e, 0xae, 0x9d], title: 'Ctrl+C — interrupt' },
		{ label: '^D', codes: [0x1d, 0x20, 0xa0, 0x9d], title: 'Ctrl+D — end of input' },
		{ label: '^L', codes: [0x1d, 0x26, 0xa6, 0x9d], title: 'Ctrl+L — clear screen' },
		{ label: 'ESC', codes: [0x01, 0x81], title: 'Escape' },
		{ label: '↓', codes: [0xe0, 0x50, 0xe0, 0xd0], title: 'Arrow down' },
		{ label: '←', codes: [0xe0, 0x4b, 0xe0, 0xcb], title: 'Arrow left' },
		{ label: '→', codes: [0xe0, 0x4d, 0xe0, 0xcd], title: 'Arrow right' }
	];
</script>

<div class="border border-white/20 bg-black/60 rounded-xs p-1.5 space-y-1 select-none">
	<div class="flex items-center justify-between gap-2 px-0.5">
		<span class="text-[10px] font-mono font-bold text-white/40 uppercase">
			ON-SCREEN KEYBOARD
			<span class="text-white/25 normal-case">· sends scancodes, not characters</span>
		</span>
		{#if onClose}
			<button onclick={onClose} class="text-[10px] font-mono text-white/40 hover:text-white cursor-pointer">[ hide ]</button>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-1">
		{#each MACROS as macro (macro.label)}
			<button
				onclick={() => send(macro.codes)}
				title={macro.title}
				class="px-2 py-1 border border-[#e5c07b]/40 text-[#e5c07b] rounded-xs text-[11px] font-mono font-bold cursor-pointer hover:bg-[#e5c07b]/20 active:scale-95"
			>
				{macro.label}
			</button>
		{/each}
	</div>

	{#each ROWS as row, i (i)}
		<div class="flex gap-1">
			{#if i === 3}
				<button
					onclick={toggleShift}
					class="border rounded-xs text-[11px] font-mono font-bold cursor-pointer active:scale-95 py-1.5 transition-colors {shiftLocked
						? 'border-[#e06c75] bg-[#e06c75]/30 text-[#e06c75]'
						: shift
							? 'border-[#e5c07b] bg-[#e5c07b]/25 text-[#e5c07b]'
							: 'border-white/20 text-white/60'}"
					style="flex: 1.5"
					title="Tap to arm for one key, tap again to lock"
				>
					⇧{shiftLocked ? '*' : ''}
				</button>
			{/if}
			{#each row as key (key.code + key.label)}
				<button
					onclick={() => press(key)}
					class="border border-white/20 bg-white/5 text-[#d8dee9] rounded-xs text-[11px] sm:text-xs font-mono cursor-pointer hover:bg-white/15 active:scale-95 active:bg-white/25 py-1.5"
					style="flex: {key.width ?? 1}"
				>
					{shift && key.shifted ? key.shifted : key.label}
				</button>
			{/each}
		</div>
	{/each}

	<div class="flex gap-1">
		<button
			onclick={toggleCtrl}
			class="border rounded-xs text-[11px] font-mono font-bold cursor-pointer active:scale-95 py-1.5 transition-colors {ctrlLocked
				? 'border-[#e06c75] bg-[#e06c75]/30 text-[#e06c75]'
				: ctrl
					? 'border-[#e5c07b] bg-[#e5c07b]/25 text-[#e5c07b]'
					: 'border-white/20 text-white/60'}"
			style="flex: 1.5"
			title="Tap to arm for one key, tap again to lock"
		>
			CTRL{ctrlLocked ? '*' : ''}
		</button>
		<button
			onclick={() => (alt = !alt)}
			class="border rounded-xs text-[11px] font-mono font-bold cursor-pointer active:scale-95 py-1.5 transition-colors {alt
				? 'border-[#e5c07b] bg-[#e5c07b]/25 text-[#e5c07b]'
				: 'border-white/20 text-white/60'}"
			style="flex: 1.5"
		>
			ALT
		</button>
		<button
			onclick={() => press({ label: '␣', code: 0x39 })}
			class="border border-white/20 bg-white/5 text-white/70 rounded-xs text-[11px] font-mono cursor-pointer hover:bg-white/15 active:scale-95 py-1.5"
			style="flex: 6"
		>
			space
		</button>
	</div>
</div>
