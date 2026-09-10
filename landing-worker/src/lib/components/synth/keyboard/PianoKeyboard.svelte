<script lang="ts">
	import { playSound } from '../../../sound';
	import { t } from '../../../i18n';
	import { PIANO_ROLL_NOTES } from '../../../synth';
	import { activeTrackId } from '../../../stores/synth-transport';
	import {
		currentTrack,
		tracksState,
		isOverlayMode,
		overlayTrackIds,
		activePlayingNotes,
		holdManualNote,
		releaseManualNote,
		activeTrackRow,
		activeKey,
		keyIsCustomised
	} from '../../../stores/synth-tracks';
	import {
		midiInputsForActiveTrack,
		isSustainActive,
		setSustainPedal,
		velocityCurve,
		cycleVelocityCurve
	} from '../../../stores/synth-midi';
	import { isSynthSettingsOpen, synthSettingsTab } from '../../../stores/synth-settings';

	/* The badge sits in a fixed row beside the octave and velocity controls, so
	   it cannot grow with the device names: "GO:KEYS 3 MIDI BLUETOOTH + ROLAND
	   DIGITAL PIANO" pushed the row wider than the keyboard. Name the first
	   input, trimmed to a readable stub, and count the rest -- the full list is
	   one click away in the settings this badge opens. */
	const MIDI_NAME_MAX = 16;

	function midiBadgeLabel(names: string[]): string {
		if (!names.length) return 'STANDBY';
		const first = names[0].toUpperCase();
		const head = first.length > MIDI_NAME_MAX ? `${first.slice(0, MIDI_NAME_MAX - 1)}…` : first;
		return names.length > 1 ? `${head} +${names.length - 1}` : head;
	}
	import { suspendNavHotkeys } from '../../../stores/hotkeys';

	let kbOctaveFrom = $state(1);
	let kbOctaveTo = $state(7);

	interface WhiteKey {
		note: string;
		idx: number;
	}
	interface BlackKey {
		note: string;
		idx: number;
		whiteKeyIndexBefore: number;
	}

	let whiteKeys = $derived.by(() => {
		const keys: WhiteKey[] = [];
		const wNoteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
		for (let oct = kbOctaveFrom; oct <= kbOctaveTo; oct++) {
			wNoteNames.forEach((n) => {
				const fullName = `${n}${oct}`;
				const idx = PIANO_ROLL_NOTES.findIndex((p) => p.note === fullName);
				if (idx >= 0) keys.push({ note: fullName, idx });
			});
		}
		return keys;
	});

	let blackKeys = $derived.by(() => {
		const keys: BlackKey[] = [];
		for (let oct = kbOctaveFrom; oct <= kbOctaveTo; oct++) {
			const bSpecs = [
				{ name: `C#${oct}`, afterWhite: `C${oct}` },
				{ name: `D#${oct}`, afterWhite: `D${oct}` },
				{ name: `F#${oct}`, afterWhite: `F${oct}` },
				{ name: `G#${oct}`, afterWhite: `G${oct}` },
				{ name: `A#${oct}`, afterWhite: `A${oct}` }
			];
			bSpecs.forEach((b) => {
				const idx = PIANO_ROLL_NOTES.findIndex((p) => p.note === b.name);
				const wIdx = whiteKeys.findIndex((w) => w.note === b.afterWhite);
				if (idx >= 0 && wIdx >= 0) keys.push({ note: b.name, idx, whiteKeyIndexBefore: wIdx });
			});
		}
		return keys;
	});

	let keyWidthPct = $derived(whiteKeys.length > 0 ? 100 / whiteKeys.length : 0);
	let percussion = $derived(!!$activeTrackRow?.percussion);

	function keyColorFor(idx: number): string {
		const entry = $activePlayingNotes.get(idx);
		const isPlaying =
			!!entry &&
			($isOverlayMode
				? $overlayTrackIds.includes(entry.trackId)
				: entry.trackId === $activeTrackId);
		if (!isPlaying) return '';
		const trk = entry && $tracksState[entry.trackId];
		return trk ? trk.color : $currentTrack.color;
	}

	function isKeyPlaying(idx: number): boolean {
		const entry = $activePlayingNotes.get(idx);
		return (
			!!entry &&
			($isOverlayMode ? $overlayTrackIds.includes(entry.trackId) : entry.trackId === $activeTrackId)
		);
	}

	function pressKey(idx: number) {
		/* In percussion mode a key is a sound of its own, so pressing one selects
		   it for editing the way the piano roll does -- otherwise the knobs kept
		   editing whatever key was last touched over in the roll. */
		if ($activeTrackRow?.percussion) activeKey.set(idx);
		// No UI click over the top: the note is the feedback.
		holdManualNote($activeTrackId, idx, 80);
	}
	function releaseKey(idx: number) {
		releaseManualNote($activeTrackId, idx);
	}

	// ── QWERTY-as-piano: two rows (Z = base octave, Q = base+1), Ableton-style ──
	let qwertyOn = $state(false);
	let qwertyOctave = $state(4);
	const heldByCode = new Map<string, number>();

	// semitone offsets from the base octave's C
	const QWERTY_MAP: Record<string, number> = {
		KeyZ: 0,
		KeyS: 1,
		KeyX: 2,
		KeyD: 3,
		KeyC: 4,
		KeyV: 5,
		KeyG: 6,
		KeyB: 7,
		KeyH: 8,
		KeyN: 9,
		KeyJ: 10,
		KeyM: 11,
		Comma: 12,
		KeyL: 13,
		Period: 14,
		KeyQ: 12,
		Digit2: 13,
		KeyW: 14,
		Digit3: 15,
		KeyE: 16,
		KeyR: 17,
		Digit5: 18,
		KeyT: 19,
		Digit6: 20,
		KeyY: 21,
		Digit7: 22,
		KeyU: 23,
		KeyI: 24,
		Digit9: 25,
		KeyO: 26,
		Digit0: 27,
		KeyP: 28
	};

	function semitoneToNoteIdx(semi: number): number | null {
		const midi = 12 * (qwertyOctave + 1) + semi;
		const idx = 108 - midi;
		return idx >= 0 && idx < PIANO_ROLL_NOTES.length ? idx : null;
	}

	/* Octave shift on a *tap* of Ctrl (down) or Shift (up): the shift happens on
	   key-up, and only if nothing else was pressed or clicked while the key was
	   held, so Ctrl+C, Shift+click and Shift+arrow reach the roll's editor
	   without changing the octave. [ / ] still work as a fallback. */
	let modHeld: string | null = null;
	let modUsed = false;
	function modPointer() {
		if (modHeld) modUsed = true;
	}

	function qwertyKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		if (['input', 'textarea'].includes(target?.tagName?.toLowerCase() ?? '')) return;

		if (
			e.code === 'ControlLeft' ||
			e.code === 'ControlRight' ||
			e.code === 'ShiftLeft' ||
			e.code === 'ShiftRight'
		) {
			if (!e.repeat) {
				modHeld = e.code;
				modUsed = false;
			}
			return;
		}
		if (modHeld) modUsed = true;
		// Space = sustain pedal, momentary like the real thing: held down = pedal down
		if (e.code === 'Space') {
			e.preventDefault();
			if (!e.repeat) setSustainPedal(true);
			return;
		}
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.code === 'BracketLeft') {
			e.preventDefault();
			qwertyOctave = Math.max(1, qwertyOctave - 1);
			return;
		}
		if (e.code === 'BracketRight') {
			e.preventDefault();
			qwertyOctave = Math.min(6, qwertyOctave + 1);
			return;
		}
		const semi = QWERTY_MAP[e.code];
		if (semi === undefined) return;
		e.preventDefault();
		if (e.repeat || heldByCode.has(e.code)) return;
		const idx = semitoneToNoteIdx(semi);
		if (idx === null) return;
		heldByCode.set(e.code, idx);
		holdManualNote($activeTrackId, idx, 90);
	}

	function qwertyKeyup(e: KeyboardEvent) {
		if (e.code === modHeld) {
			if (!modUsed)
				qwertyOctave = e.code.startsWith('Control')
					? Math.max(1, qwertyOctave - 1)
					: Math.min(6, qwertyOctave + 1);
			modHeld = null;
			return;
		}
		if (e.code === 'Space') {
			setSustainPedal(false);
			return;
		}
		const idx = heldByCode.get(e.code);
		if (idx === undefined) return;
		heldByCode.delete(e.code);
		releaseManualNote($activeTrackId, idx);
	}

	function releaseAllQwerty() {
		for (const [code, idx] of heldByCode) {
			releaseManualNote($activeTrackId, idx);
			heldByCode.delete(code);
		}
	}

	function toggleQwerty() {
		qwertyOn = !qwertyOn;
		playSound('toggle');
	}

	$effect(() => {
		if (!qwertyOn) return;
		suspendNavHotkeys.set(true);
		window.addEventListener('keydown', qwertyKeydown);
		window.addEventListener('keyup', qwertyKeyup);
		window.addEventListener('pointerdown', modPointer, true);
		window.addEventListener('blur', releaseAllQwerty);
		return () => {
			releaseAllQwerty();
			suspendNavHotkeys.set(false);
			window.removeEventListener('keydown', qwertyKeydown);
			window.removeEventListener('keyup', qwertyKeyup);
			window.removeEventListener('pointerdown', modPointer, true);
			window.removeEventListener('blur', releaseAllQwerty);
		};
	});
</script>

<div
	data-tour="synth-keys"
	class="border border-white/20 bg-black/60 rounded-xs p-1.5 pt-1 flex flex-col gap-1 shrink-0 select-none"
>
	<div class="flex flex-wrap items-center justify-between gap-1.5 text-xs font-mono">
		<div class="flex items-center gap-1.5">
			<span class="font-black text-[#56b6c2]">PIANO KEYBOARD</span>
			<span class="text-white/40 text-[10px] hidden sm:inline"
				>| C{kbOctaveFrom} - B{kbOctaveTo} AUDITION</span
			>
		</div>

		<div class="flex items-center gap-2">
			<!-- One range, not two numbers. FROM and TO named what the arrows on
			     either side of each number already say, and "OCT:" carries the
			     rest; the two ends read as a span now. -->
			<div class="flex items-center gap-1 text-xs">
				<span class="opacity-60 text-xs font-bold" title={$t('synthPanels.keyboard.octRangeHint')}
					>OCT:</span
				>

				<div class="flex items-center gap-0.5">
					<button
						onclick={() => {
							kbOctaveFrom = Math.max(1, kbOctaveFrom - 1);
							playSound('click');
						}}
						disabled={kbOctaveFrom <= 1}
						class="press px-1 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs leading-none transition-colors"
						title={$t('synthPanels.keyboard.lowerStartHint')}
					>
						◄
					</button>
					<span
						class="px-1 py-0.5 text-xs font-mono font-bold bg-white/10 rounded-xs text-[#56b6c2] min-w-[16px] text-center"
						>{kbOctaveFrom}</span
					>
					<button
						onclick={() => {
							kbOctaveFrom = Math.min(kbOctaveTo, kbOctaveFrom + 1);
							playSound('click');
						}}
						disabled={kbOctaveFrom >= kbOctaveTo}
						class="press px-1 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs leading-none transition-colors"
						title={$t('synthPanels.keyboard.raiseStartHint')}
					>
						►
					</button>

					<span class="text-white/30 text-[10px] px-0.5 select-none">–</span>

					<button
						onclick={() => {
							kbOctaveTo = Math.max(kbOctaveFrom, kbOctaveTo - 1);
							playSound('click');
						}}
						disabled={kbOctaveTo <= kbOctaveFrom}
						class="press px-1 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs leading-none transition-colors"
						title={$t('synthPanels.keyboard.lowerEndHint')}
					>
						◄
					</button>
					<span
						class="px-1 py-0.5 text-xs font-mono font-bold bg-white/10 rounded-xs text-[#56b6c2] min-w-[16px] text-center"
						>{kbOctaveTo}</span
					>
					<button
						onclick={() => {
							kbOctaveTo = Math.min(7, kbOctaveTo + 1);
							playSound('click');
						}}
						disabled={kbOctaveTo >= 7}
						class="press px-1 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs leading-none transition-colors"
						title={$t('synthPanels.keyboard.raiseEndHint')}
					>
						►
					</button>
				</div>
			</div>

			<span class="opacity-30">|</span>

			<button
				onclick={toggleQwerty}
				class="press px-1.5 py-0.2 rounded-xs border text-[10px] font-bold cursor-pointer transition-all {qwertyOn
					? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black shadow-[0_0_6px_#56b6c2]'
					: 'border-white/20 bg-white/5 text-white/50 hover:text-white hover:border-white/40'}"
				title={$t('synthPanels.keyboard.qwertyToggleHint')}
			>
				KBD: {qwertyOn ? 'ON' : 'OFF'}
			</button>
			{#if qwertyOn}
				<span
					class="px-1.5 py-0.2 text-[10px] font-mono font-bold bg-white/10 rounded-xs text-[#56b6c2]"
					title={$t('synthPanels.keyboard.qwertyOctaveHint')}>C{qwertyOctave}</span
				>
			{/if}

			<span class="opacity-30">|</span>

			<button
				onclick={() => {
					setSustainPedal(!$isSustainActive);
					playSound('toggle');
				}}
				class="press px-1.5 py-0.2 rounded-xs border text-[10px] font-bold cursor-pointer transition-all {$isSustainActive
					? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black shadow-[0_0_6px_#e5c07b]'
					: 'border-white/20 bg-white/5 text-white/50 hover:text-white hover:border-white/40'}"
				title={$t('synthPanels.keyboard.sustainHint')}
			>
				SUS: {$isSustainActive ? 'ON' : 'OFF'}
			</button>

			<span class="opacity-30">|</span>

			<button
				onclick={() => {
					cycleVelocityCurve();
					playSound('toggle');
				}}
				class="press px-1.5 py-0.2 rounded-xs border text-[10px] font-bold cursor-pointer transition-all {$velocityCurve ===
				'EXP'
					? 'border-[#61afef] bg-[#61afef] text-black font-black shadow-[0_0_6px_#61afef]'
					: $velocityCurve === 'LINEAR'
						? 'border-[#98c379] bg-[#98c379] text-black font-black shadow-[0_0_6px_#98c379]'
						: $velocityCurve === 'LOG'
							? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black shadow-[0_0_6px_#e5c07b]'
							: $velocityCurve === 'HARD'
								? 'border-[#e06c75] bg-[#e06c75] text-black font-black shadow-[0_0_6px_#e06c75]'
								: 'border-white/20 bg-white/5 text-white/40 hover:text-white hover:border-white/40'}"
				title={$t('synthPanels.keyboard.velocityCurveHint', { curve: $velocityCurve })}
			>
				VEL: {$velocityCurve === 'LINEAR' ? 'LIN' : $velocityCurve}
			</button>

			<!-- Pinned right: a device name is as long as its maker made it, and
			     letting it sit inline shifted every control before it. Names the
			     inputs routed to *this* track rather than the first one connected,
			     which said GO:KEYS on a track GO:KEYS does not play. -->
			<button
				onclick={() => {
					synthSettingsTab.set('midi');
					isSynthSettingsOpen.set(true);
					playSound('click');
				}}
				title={$t('synthPanels.midi.openSettingsHint')}
				class="press ml-auto flex items-center gap-1 px-1.5 py-0.2 rounded-xs border text-[10px] font-bold whitespace-nowrap cursor-pointer {$midiInputsForActiveTrack.length
					? 'border-[#98c379] bg-[#98c379]/15 text-[#98c379]'
					: 'border-white/20 bg-white/5 text-white/40 hover:text-white/70'}"
			>
				<span
					class="w-1.5 h-1.5 rounded-full {$midiInputsForActiveTrack.length
						? 'bg-[#98c379] animate-pulse'
						: 'bg-white/30'}"
				></span>
				<span>MIDI: {midiBadgeLabel($midiInputsForActiveTrack)}</span>
			</button>
		</div>
	</div>

	<div
		class="relative h-12 w-full flex bg-black/80 rounded-xs border border-white/15 p-0.5 overflow-hidden"
	>
		{#if whiteKeys.length > 0}
			<div class="flex w-full h-full gap-0.5">
				{#each whiteKeys as wk (wk.note)}
					{@const isPlaying = isKeyPlaying(wk.idx)}
					{@const color = keyColorFor(wk.idx)}
					<button
						onmousedown={() => pressKey(wk.idx)}
						onmouseup={() => releaseKey(wk.idx)}
						onmouseleave={() => releaseKey(wk.idx)}
						ontouchstart={(e) => {
							e.preventDefault();
							pressKey(wk.idx);
						}}
						ontouchend={() => releaseKey(wk.idx)}
						class="flex-1 h-full rounded-xs flex flex-col justify-end pb-0.5 items-center cursor-pointer transition-all border {isPlaying
							? 'shadow-[0_0_10px_currentColor]'
							: percussion && $activeKey === wk.idx
								? 'bg-[#c678dd] text-black border-[#c678dd] shadow-[0_0_8px_rgba(198,120,221,0.7)]'
								: 'bg-[#e8e6e1] hover:bg-white text-black/70 border-black/30'}"
						style={isPlaying
							? `background-color: ${color}; border-color: ${color}; color: #000;`
							: ''}
						title={$t('synthPanels.keyboard.playNoteHint', {
							note: wk.note,
							freq: PIANO_ROLL_NOTES[wk.idx]?.freq.toFixed(1) ?? ''
						})}
					>
						<!-- Only the Cs are named, and only by their octave number.
					     Seven octaves of white keys is 49 labels across the strip;
					     at that density every one of them collided with its
					     neighbours and none could be read. One number per octave is
					     what the eye actually navigates by -- find C4, count from
					     there -- and it leaves each label room to be legible.

					     Above the dot, not below it: stacked the other way a key that
					     carried both sat its number one dot higher than its
					     neighbours, so the octave numbers no longer lined up. -->
						{#if wk.note.startsWith('C') && !wk.note.includes('#')}
							<span class="text-[9px] font-mono font-black opacity-70 leading-none"
								>{wk.note.slice(1)}</span
							>
						{/if}
						<!-- A kit key carries its own sound, and the piano roll marks those
					     with a dot. The keyboard is where they are actually played, so
					     it needs the same mark -- without it the only way to find which
					     keys the kit fills was to press all 88. The slot is always
					     there, so a dot appearing cannot move the number above it. -->
						{#if percussion}
							<span
								class="w-2 h-2 mt-0.5 rounded-full {keyIsCustomised($activeTrackRow, wk.idx)
									? $activeKey === wk.idx
										? 'bg-black/70'
										: 'bg-[#c678dd]/70'
									: ''}"
							></span>
						{/if}
					</button>
				{/each}
			</div>

			{#each blackKeys as bk (bk.note)}
				{@const isPlaying = isKeyPlaying(bk.idx)}
				{@const color = keyColorFor(bk.idx)}
				{@const leftPos = (bk.whiteKeyIndexBefore + 1) * keyWidthPct - keyWidthPct * 0.32}
				{@const bWidth = keyWidthPct * 0.64}
				<button
					onmousedown={(e) => {
						e.stopPropagation();
						pressKey(bk.idx);
					}}
					onmouseup={(e) => {
						e.stopPropagation();
						releaseKey(bk.idx);
					}}
					onmouseleave={() => releaseKey(bk.idx)}
					ontouchstart={(e) => {
						e.preventDefault();
						e.stopPropagation();
						pressKey(bk.idx);
					}}
					ontouchend={(e) => {
						e.stopPropagation();
						releaseKey(bk.idx);
					}}
					class="absolute top-0 h-[62%] rounded-b-xs flex flex-col justify-end pb-0.5 items-center cursor-pointer z-10 transition-all border {isPlaying
						? 'shadow-[0_0_10px_currentColor]'
						: percussion && $activeKey === bk.idx
							? 'bg-[#c678dd] text-black border-[#c678dd] shadow-[0_0_8px_rgba(198,120,221,0.7)]'
							: 'bg-[#181a1f] hover:bg-[#282c34] text-white/60 border-black'}"
					style="left: {leftPos}%; width: {bWidth}%; {isPlaying
						? `background-color: ${color}; border-color: ${color}; color: #000;`
						: ''}"
					title={$t('synthPanels.keyboard.playNoteHint', {
						note: bk.note,
						freq: PIANO_ROLL_NOTES[bk.idx]?.freq.toFixed(1) ?? ''
					})}
				>
					<!-- Unlabelled: a black key is barely wider than the text that
					     was on it, so those labels were the densest part of the
					     collision. Their names are on the title, and a keyboard is
					     read from the Cs and the black-key groups anyway. The kit dot
					     still fits, and GM puts real sounds on the black keys. -->
					{#if percussion && keyIsCustomised($activeTrackRow, bk.idx)}
						<span
							class="w-1.5 h-1.5 rounded-full mb-1 {$activeKey === bk.idx
								? 'bg-black/70'
								: 'bg-[#c678dd]/80'}"
						></span>
					{/if}
				</button>
			{/each}
		{/if}
	</div>
</div>
