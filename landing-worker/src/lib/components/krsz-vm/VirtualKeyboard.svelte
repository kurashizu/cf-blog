<script lang="ts">
	/**
	 * A full PC keyboard that sends PS/2 set-1 scancodes straight to the guest.
	 *
	 * It exists for phones, where a software IME cannot usefully drive a terminal,
	 * but it is also more correct than a physical keyboard: v86 maps browser key
	 * events through an assumed US layout, so a non-US layout mistypes
	 * punctuation. Scancodes bypass that entirely.
	 */
	let {
		send,
		onClose
	}: {
		send: (scancodes: number[]) => void;
		onClose?: () => void;
	} = $props();

	interface Key {
		label: string;
		/** Shown instead of `label` while shift is armed. */
		shifted?: string;
		/** Set-1 make code; the break code is `make | 0x80`. */
		code: number;
		/** Grey keys are sent with an 0xE0 prefix. */
		ext?: boolean;
		/** Width in units of one standard key. */
		w?: number;
		/** Rendered as a modifier rather than a character key. */
		mod?: 'shift' | 'ctrl' | 'alt' | 'caps';
		/** Dimmer styling for keys that are not characters. */
		muted?: boolean;
	}

	const FN: Key[] = [
		{ label: 'Esc', code: 0x01, w: 1.4, muted: true },
		...Array.from({ length: 12 }, (_, i) => ({
			label: `F${i + 1}`,
			// F1-F10 are 0x3B-0x44; F11 and F12 sit apart at 0x57/0x58.
			code: i < 10 ? 0x3b + i : i === 10 ? 0x57 : 0x58,
			muted: true
		}))
	];

	const ROW_NUM: Key[] = [
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
		{ label: '⌫', code: 0x0e, w: 1.8, muted: true }
	];

	const ROW_TAB: Key[] = [
		{ label: 'Tab', code: 0x0f, w: 1.4, muted: true },
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
		{ label: '\\', shifted: '|', code: 0x2b, w: 1.4 }
	];

	const ROW_HOME: Key[] = [
		{ label: 'Caps', code: 0x3a, w: 1.8, mod: 'caps', muted: true },
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
		{ label: 'Enter', code: 0x1c, w: 2.2, muted: true }
	];

	const ROW_SHIFT: Key[] = [
		{ label: 'Shift', code: 0x2a, w: 2.4, mod: 'shift', muted: true },
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
		{ label: '↑', code: 0x48, ext: true, muted: true },
		{ label: 'Del', code: 0x53, ext: true, w: 1.4, muted: true }
	];

	const ROW_BOTTOM: Key[] = [
		{ label: 'Ctrl', code: 0x1d, w: 1.6, mod: 'ctrl', muted: true },
		{ label: 'Alt', code: 0x38, w: 1.4, mod: 'alt', muted: true },
		{ label: 'space', code: 0x39, w: 6 },
		{ label: 'Ins', code: 0x52, ext: true, w: 1.2, muted: true },
		{ label: 'Home', code: 0x47, ext: true, w: 1.4, muted: true },
		{ label: 'End', code: 0x4f, ext: true, w: 1.3, muted: true },
		{ label: '←', code: 0x4b, ext: true, muted: true },
		{ label: '↓', code: 0x50, ext: true, muted: true },
		{ label: '→', code: 0x4d, ext: true, muted: true }
	];

	const ROWS = [FN, ROW_NUM, ROW_TAB, ROW_HOME, ROW_SHIFT, ROW_BOTTOM];

	/** Modifiers latch for one key; a second tap locks them until tapped again. */
	let shift = $state(false);
	let ctrl = $state(false);
	let alt = $state(false);
	let caps = $state(false);
	let locked = $state({ shift: false, ctrl: false, alt: false });

	const MAKE = { shift: 0x2a, ctrl: 0x1d, alt: 0x38 };

	function toggleMod(name: 'shift' | 'ctrl' | 'alt') {
		const on = name === 'shift' ? shift : name === 'ctrl' ? ctrl : alt;
		const isLocked = locked[name];
		const set = (v: boolean) => {
			if (name === 'shift') shift = v;
			else if (name === 'ctrl') ctrl = v;
			else alt = v;
		};
		if (isLocked) {
			locked = { ...locked, [name]: false };
			set(false);
		} else if (on) {
			locked = { ...locked, [name]: true };
		} else {
			set(true);
		}
	}

	function press(key: Key) {
		if (key.mod === 'shift' || key.mod === 'ctrl' || key.mod === 'alt') {
			toggleMod(key.mod);
			return;
		}
		if (key.mod === 'caps') {
			caps = !caps;
			send([0x3a, 0xba]);
			return;
		}

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

		const make = key.ext ? [0xe0, key.code] : [key.code];
		const brk = key.ext ? [0xe0, key.code | 0x80] : [key.code | 0x80];
		send([...prefix, ...make, ...brk, ...suffix]);

		// A latched modifier applies to exactly one key unless it was locked.
		if (!locked.shift) shift = false;
		if (!locked.ctrl) ctrl = false;
		if (!locked.alt) alt = false;
	}

	function modActive(key: Key): boolean {
		if (key.mod === 'shift') return shift;
		if (key.mod === 'ctrl') return ctrl;
		if (key.mod === 'alt') return alt;
		if (key.mod === 'caps') return caps;
		return false;
	}

	function modLocked(key: Key): boolean {
		return key.mod === 'shift' || key.mod === 'ctrl' || key.mod === 'alt' ? locked[key.mod] : false;
	}

	function faceOf(key: Key): string {
		if (key.shifted && shift) return key.shifted;
		if (key.shifted && caps && key.label >= 'a' && key.label <= 'z') return key.shifted;
		return key.label;
	}

	/** Sequences worth one tap in a shell. */
	const MACROS: { label: string; codes: number[]; title: string }[] = [
		{ label: '^C', codes: [0x1d, 0x2e, 0xae, 0x9d], title: 'Ctrl+C — interrupt' },
		{ label: '^D', codes: [0x1d, 0x20, 0xa0, 0x9d], title: 'Ctrl+D — end of input' },
		{ label: '^L', codes: [0x1d, 0x26, 0xa6, 0x9d], title: 'Ctrl+L — clear screen' },
		{ label: '^Z', codes: [0x1d, 0x2c, 0xac, 0x9d], title: 'Ctrl+Z — suspend' },
		{ label: 'PgUp', codes: [0xe0, 0x49, 0xe0, 0xc9], title: 'Page up' },
		{ label: 'PgDn', codes: [0xe0, 0x51, 0xe0, 0xd1], title: 'Page down' }
	];
</script>

<div class="border border-white/20 bg-black/60 rounded-xs p-1.5 space-y-1 select-none">
	<div class="flex flex-wrap items-center justify-between gap-2 px-0.5">
		<div class="flex flex-wrap items-center gap-1">
			{#each MACROS as macro (macro.label)}
				<button
					onclick={() => send(macro.codes)}
					title={macro.title}
					class="px-1.5 py-0.5 border border-[#e5c07b]/40 text-[#e5c07b] rounded-xs text-[11px] font-mono font-bold cursor-pointer hover:bg-[#e5c07b]/20 active:scale-95 transition-transform"
				>
					{macro.label}
				</button>
			{/each}
		</div>
		<div class="flex items-center gap-2">
			<span class="text-[10px] font-mono text-white/30 hidden sm:inline">
				modifiers latch for one key · tap again to lock
			</span>
			{#if onClose}
				<button onclick={onClose} class="press text-[10px] font-mono text-white/40 hover:text-white cursor-pointer transition-colors">
					[ hide ]
				</button>
			{/if}
		</div>
	</div>

	{#each ROWS as row, r (r)}
		<div class="flex gap-1">
			{#each row as key (String(key.code) + key.label)}
				{@const active = modActive(key)}
				{@const isLocked = modLocked(key)}
				<button
					onclick={() => press(key)}
					title={key.mod ? 'Tap to arm for one key, tap again to lock' : undefined}
					class="border rounded-xs font-mono cursor-pointer active:scale-95 transition-[color,background-color,border-color,transform] py-1.5 min-w-0 truncate {r === 0
						? 'text-[10px]'
						: 'text-[11px] sm:text-xs'} {isLocked
						? 'border-[#e06c75] bg-[#e06c75]/30 text-[#e06c75] font-bold'
						: active
							? 'border-[#e5c07b] bg-[#e5c07b]/25 text-[#e5c07b] font-bold'
							: key.muted
								? 'border-white/15 bg-white/[0.02] text-white/55 hover:bg-white/10'
								: 'border-white/20 bg-white/5 text-[#d8dee9] hover:bg-white/15 active:bg-white/25'}"
					style="flex: {key.w ?? 1}"
				>
					{faceOf(key)}{isLocked ? '*' : ''}
				</button>
			{/each}
		</div>
	{/each}
</div>
