<script lang="ts">
	import { tick } from 'svelte';
	import { scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
	import { playSound } from '../../sound';
	import {
		SOUND_PRESETS,
		PRESET_CATEGORIES,
		userPresets,
		allPresets,
		soundPresetIdx,
		applyPresetAt,
		saveActiveAsPreset,
		deleteUserPreset,
		renameUserPreset,
		exportActivePreset,
		handleImportPresetFile,
		BUILTIN_KITS,
		userKits,
		applyKit,
		saveActiveAsKit,
		deleteUserKit,
		renameUserKit,
		exportActiveKit,
		handleImportKitFile,
		CATEGORY_HINTS,
		type PresetCategory,
		type DrumKit
	} from '../../stores/synth-presets';
	import { activeTrackRow, toggleTrackPercussion } from '../../stores/synth-tracks';
	import { activeTrackId } from '../../stores/synth-transport';
	import { PRESET_TOOLTIPS } from './tooltips';

	/* A cascading menu, like a DAW's browser: the first level is categories,
	   the second is the entries in the one you are over. The list used to be
	   one long column, twenty rows before you reached your own presets, and it
	   only gets longer. Now it is five rows, and each flyout is short enough
	   to read at a glance. Hover opens a flyout; so does click, for touch. */
	type Section = PresetCategory | 'KITS' | 'MINE';
	const SECTIONS: { id: Section; label: string; hint: string }[] = [
		...PRESET_CATEGORIES.map((c) => ({ id: c as Section, label: c, hint: CATEGORY_HINTS[c] })),
		{ id: 'KITS', label: 'KITS', hint: 'Whole key tables — turns the active track into a drum machine (percussion mode)' },
		{ id: 'MINE', label: 'MY PRESETS', hint: 'What you saved or imported here; rename and remove in place' }
	];

	let open = $state(false);
	let section: Section | null = $state(null);
	let fileInput: HTMLInputElement | undefined = $state();
	let kitInput: HTMLInputElement | undefined = $state();

	let current = $derived($allPresets[$soundPresetIdx] ?? $allPresets[0]);
	let percussion = $derived(!!$activeTrackRow?.percussion);

	/* Rename happens in place: the row turns into an input, Enter or blur
	   commits, Escape puts the old name back. The store dedupes the name, so
	   what ends up shown may carry a suffix. Presets and kits share the one
	   editor; `editing` says which list and which row. */
	let editing: { list: 'preset' | 'kit'; i: number } | null = $state(null);
	let draft = $state('');
	let editInput: HTMLInputElement | undefined = $state();

	function close() {
		open = false;
		section = null;
		editing = null;
	}

	function toggle() {
		if (open) close();
		else {
			open = true;
			section = null;
		}
		playSound('click');
	}

	function pick(idx: number) {
		close();
		applyPresetAt(idx);
	}

	function pickKit(kit: DrumKit) {
		close();
		applyKit(kit);
	}

	function save() {
		close();
		saveActiveAsPreset();
	}

	function saveKit() {
		close();
		saveActiveAsKit();
	}

	function exportPreset() {
		close();
		exportActivePreset();
	}

	function exportKit() {
		close();
		exportActiveKit();
	}

	function importPreset() {
		close();
		playSound('click');
		fileInput?.click();
	}

	function importKit() {
		close();
		playSound('click');
		kitInput?.click();
	}

	function onImportChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) handleImportPresetFile(file);
		if (fileInput) fileInput.value = '';
	}

	function onKitImportChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) handleImportKitFile(file);
		if (kitInput) kitInput.value = '';
	}

	async function startRename(list: 'preset' | 'kit', i: number) {
		editing = { list, i };
		draft = (list === 'preset' ? $userPresets[i]?.name : $userKits[i]?.name) ?? '';
		playSound('click');
		await tick();
		editInput?.focus();
		editInput?.select();
	}

	function commitRename() {
		if (!editing) return;
		if (editing.list === 'preset') renameUserPreset(editing.i, draft);
		else renameUserKit(editing.i, draft);
		editing = null;
	}

	function onEditKeydown(e: KeyboardEvent) {
		// Both keys mean something to the transport and the page; keep them here.
		e.stopPropagation();
		if (e.key === 'Enter') commitRename();
		else if (e.key === 'Escape') editing = null;
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) close();
	}

	const rowBase = 'press w-full text-left px-2.5 py-1.5 flex items-center gap-2 cursor-pointer transition-colors';
	const rowIdle = 'text-white/80 hover:bg-white/10';
	const rowOn = 'text-white bg-white/10 font-bold';
	const actionRow = 'press w-full text-left px-2.5 py-1.5 flex items-center gap-2 cursor-pointer font-bold transition-colors';
</script>

<svelte:window onkeydown={onWindowKeydown} />

<input bind:this={fileInput} type="file" onchange={onImportChange} accept=".json,application/json" class="hidden" />
<input bind:this={kitInput} type="file" onchange={onKitImportChange} accept=".json,application/json" class="hidden" />

{#snippet flyout(children: import('svelte').Snippet)}
	<div
		class="absolute left-full top-0 -mt-px ml-0.5 z-50 min-w-[220px] max-h-[70vh] overflow-y-auto custom-scrollbar bg-[#121417] border border-[#56b6c2]/50 rounded-xs shadow-[0_8px_24px_rgba(0,0,0,0.7)] py-1 text-xs font-mono"
		transition:scale={{ duration: 120, start: 0.97, opacity: 0, easing: cubicOut }}
	>
		{@render children()}
	</div>
{/snippet}

{#snippet editRow(list: 'preset' | 'kit', i: number, name: string, isOn: boolean, onPick: () => void, onDelete: () => void, pickTitle: string)}
	<div class="relative flex items-center transition-colors {isOn ? rowOn : rowIdle}">
		{#if editing && editing.list === list && editing.i === i}
			<span class="shrink-0 pl-2.5 text-[#56b6c2]">✎</span>
			<input
				bind:this={editInput}
				bind:value={draft}
				onkeydown={onEditKeydown}
				onblur={commitRename}
				maxlength="40"
				spellcheck="false"
				class="focus-glow flex-1 min-w-0 mx-2 my-1 px-1.5 py-0.5 bg-black/60 border border-[#56b6c2]/50 text-white text-xs font-mono font-bold uppercase rounded-xs outline-none"
				style="--krsz-focus-color: #56b6c2"
				aria-label="Name"
			/>
		{:else}
			<button onclick={onPick} class="press flex-1 min-w-0 text-left px-2.5 py-1.5 flex items-center gap-2 cursor-pointer" title={pickTitle}>
				<span class="shrink-0 {isOn ? 'text-[#98c379]' : 'text-white/25'}">{isOn ? '●' : '○'}</span>
				<span class="truncate">{name}</span>
			</button>
			<button onclick={() => startRename(list, i)} class="press shrink-0 px-1.5 py-1.5 text-white/30 hover:text-[#56b6c2] cursor-pointer transition-colors" title={`Rename ${name}`} aria-label={`Rename ${name}`}>✎</button>
			<button onclick={onDelete} class="press shrink-0 pl-1.5 pr-2.5 py-1.5 text-white/30 hover:text-[#e06c75] cursor-pointer transition-colors" title={`Remove ${name}`} aria-label={`Remove ${name}`}>✕</button>
		{/if}
	</div>
{/snippet}

<div class="flex items-center gap-1 text-xs">
	<span class="text-white/60 font-bold text-[11px] pl-0.5">PRESET:</span>
	<div class="relative">
		<button
			onclick={toggle}
			title={`Sound preset for the active ${percussion ? 'key' : 'track'} — ${PRESET_TOOLTIPS[current?.name] || current?.name}. ↑/↓ cycle presets.`}
			class="press px-1.5 py-0.5 border rounded-xs font-bold transition-colors cursor-pointer text-xs flex items-center gap-1 {open
				? 'border-[#56b6c2] bg-[#56b6c2] text-black'
				: 'border-white/20 hover:border-[#56b6c2] bg-white/5 hover:bg-white/15 text-white hover:text-[#56b6c2]'}"
		>
			<span>{current?.name}</span>
			<span class="text-[9px] leading-none inline-block transition-transform duration-150" style={open ? 'transform: rotate(180deg)' : undefined}>▼</span>
		</button>

		{#if open}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="fixed inset-0 z-40" onclick={close}></div>

			<div
				class="origin-top absolute left-0 top-full mt-1 z-50 min-w-[230px] bg-[#121417] border border-[#56b6c2]/50 rounded-xs shadow-[0_8px_24px_rgba(0,0,0,0.7)] py-1 text-xs font-mono"
				transition:scale={{ duration: 140, start: 0.95, opacity: 0, easing: cubicOut }}
			>
				{#each SECTIONS as sec (sec.id)}
					{@const isOpen = section === sec.id}
					{@const count = sec.id === 'MINE' ? $userPresets.length + $userKits.length : sec.id === 'KITS' ? BUILTIN_KITS.length : SOUND_PRESETS.filter((p) => p.category === sec.id).length}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="relative" onmouseenter={() => (section = sec.id)}>
						<button
							onclick={() => (section = isOpen ? null : sec.id)}
							class="{rowBase} justify-between {isOpen ? rowOn : rowIdle}"
							title={sec.hint}
						>
							<span class="flex items-center gap-2 min-w-0">
								<span class="truncate">{sec.label}</span>
								<span class="text-[10px] text-white/30">{count}</span>
							</span>
							<span class="text-[9px] text-white/40">►</span>
						</button>

						{#if isOpen}
							{#if sec.id !== 'KITS' && sec.id !== 'MINE'}
								{@render flyout(presetList)}
								{#snippet presetList()}
									{#each SOUND_PRESETS as p, idx (p.name)}
										{#if p.category === sec.id}
											<button onclick={() => pick(idx)} class="{rowBase} {$soundPresetIdx === idx ? rowOn : rowIdle}" title={PRESET_TOOLTIPS[p.name] || p.name}>
												<span class="shrink-0 {$soundPresetIdx === idx ? 'text-[#98c379]' : 'text-white/25'}">{$soundPresetIdx === idx ? '●' : '○'}</span>
												<span class="truncate">{p.name}</span>
											</button>
										{/if}
									{/each}
								{/snippet}
							{:else if sec.id === 'KITS'}
								{@render flyout(kitList)}
								{#snippet kitList()}
									<div class="px-2.5 pt-0.5 pb-0.5 text-[10px] font-bold text-white/40 select-none">BUILT-IN</div>
									{#each BUILTIN_KITS as kit (kit.name)}
										<button onclick={() => pickKit(kit)} class="{rowBase} {rowIdle}" title={`Load ${kit.name} onto the active track — turns percussion mode on and replaces its key table (${Object.keys(kit.keys).length} keys)`}>
											<span class="shrink-0 text-white/25">○</span>
											<span class="truncate">{kit.name}</span>
											<span class="ml-auto text-[10px] text-white/30">{Object.keys(kit.keys).length} keys</span>
										</button>
									{/each}
									{#if $userKits.length}
										<div class="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold text-white/40 border-t border-white/10 mt-1 select-none">MY KITS</div>
										{#each $userKits as kit, i (i)}
											{@render editRow('kit', i, kit.name, false, () => pickKit(kit), () => deleteUserKit(i), `Load ${kit.name} onto the active track (${Object.keys(kit.keys).length} keys)`)}
										{/each}
									{/if}
									<div class="border-t border-white/10 mt-1 pt-1">
										<button onclick={saveKit} class="{actionRow} {percussion ? 'text-[#98c379] hover:bg-[#98c379]/20' : 'text-white/30 cursor-not-allowed'}" title={percussion ? "Keep the active track's key table as a kit in this browser" : 'Turn on P on the active track and give keys their sounds first'}>
											<span class="shrink-0">＋</span>
											<span>SAVE TRACK AS KIT</span>
										</button>
										<button onclick={importKit} class="{actionRow} text-[#56b6c2] hover:bg-[#56b6c2]/20" title="Import a kit .json onto the active track; dropping the file anywhere on the page works too">
											<span class="shrink-0">▲</span>
											<span>IMPORT KIT…</span>
										</button>
										<button onclick={exportKit} class="{actionRow} {percussion ? 'text-[#56b6c2] hover:bg-[#56b6c2]/20' : 'text-white/30 cursor-not-allowed'}" title={percussion ? "Download the active track's key table as a kit .json" : 'Turn on P on the active track and give keys their sounds first'}>
											<span class="shrink-0">▼</span>
											<span>EXPORT KIT</span>
										</button>
									</div>
								{/snippet}
							{:else}
								{@render flyout(mineList)}
								{#snippet mineList()}
									{#if $userPresets.length === 0 && $userKits.length === 0}
										<div class="px-2.5 py-1.5 text-[10px] text-white/30 select-none max-w-[240px]">none yet — save the active {percussion ? 'key' : 'track'} below, or import a file</div>
									{/if}
									{#if $userPresets.length}
										<div class="px-2.5 pt-0.5 pb-0.5 text-[10px] font-bold text-white/40 select-none">PRESETS</div>
										{#each $userPresets as p, i (i)}
											{@const idx = SOUND_PRESETS.length + i}
											{@render editRow('preset', i, p.name, $soundPresetIdx === idx, () => pick(idx), () => deleteUserPreset(i), `Load ${p.name} onto the active ${percussion ? 'key' : 'track'}`)}
										{/each}
									{/if}
									{#if $userKits.length}
										<div class="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold text-white/40 select-none {$userPresets.length ? 'border-t border-white/10 mt-1' : ''}">KITS</div>
										{#each $userKits as kit, i (i)}
											{@render editRow('kit', i, kit.name, false, () => pickKit(kit), () => deleteUserKit(i), `Load ${kit.name} onto the active track (${Object.keys(kit.keys).length} keys)`)}
										{/each}
									{/if}
								{/snippet}
							{/if}
						{/if}
					</div>
				{/each}

				<div class="border-t border-white/10 mt-1 pt-1">
					<button onclick={save} class="{actionRow} text-[#98c379] hover:bg-[#98c379]/20" title={`Keep the active ${percussion ? "key's" : "track's"} current sound (racks 1-6 and AIR; not volume, pan or notes) as a preset in this browser`}>
						<span class="shrink-0">＋</span>
						<span>SAVE ACTIVE {percussion ? 'KEY' : 'TRACK'}</span>
					</button>
					<button onclick={importPreset} class="{actionRow} text-[#56b6c2] hover:bg-[#56b6c2]/20" title="Import a preset .json onto the active track or key; it is added to MY PRESETS. Dropping the file anywhere on the page works too.">
						<span class="shrink-0">▲</span>
						<span>IMPORT FILE…</span>
					</button>
					<button onclick={exportPreset} class="{actionRow} text-[#56b6c2] hover:bg-[#56b6c2]/20" title={`Download the active ${percussion ? "key's" : "track's"} sound as a preset .json`}>
						<span class="shrink-0">▼</span>
						<span>EXPORT ACTIVE {percussion ? 'KEY' : 'TRACK'}</span>
					</button>
				</div>
			</div>
		{/if}
	</div>

	<!-- Percussion mode for the active track: every key gets its own sound and
	     the racks edit the active key. Lives here because it changes what the
	     PRESET menu applies to (a key rather than the track). -->
	<button
		onclick={() => {
			toggleTrackPercussion($activeTrackId);
			playSound('toggle');
		}}
		class="press px-1.5 py-0.5 border rounded-xs font-bold text-xs cursor-pointer transition-colors flex items-center gap-1 {percussion
			? 'border-[#c678dd] bg-[#c678dd] text-black font-black shadow-[0_0_6px_rgba(198,120,221,0.5)]'
			: 'border-white/20 text-white/60 hover:text-white hover:border-[#c678dd]/60'}"
		title={percussion
			? `${$activeTrackRow?.name ?? 'This track'} is in PERCUSSION mode — every key has its own sound; racks and presets edit the active key. Click to return to one sound per track (the key table is kept).`
			: `Percussion mode for ${$activeTrackRow?.name ?? 'the active track'} — give each key its own sound, like a drum machine`}
	>
		PERC
	</button>
</div>
