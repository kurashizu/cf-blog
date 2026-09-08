<script lang="ts">
	import { tick } from 'svelte';
	import { t, locale } from '$lib/i18n';
	import { scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
	import { playSound } from '../../sound';
	import { Button } from '$lib/components/ui';
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
	import { presetTooltips } from './tooltips';

	/* A cascading menu, like a DAW's browser: the first level is categories,
	   the second is the entries in the one you are over. The list used to be
	   one long column, twenty rows before you reached your own presets, and it
	   only gets longer. Now it is five rows, and each flyout is short enough
	   to read at a glance. Hover opens a flyout; so does click, for touch. */
	type Section = PresetCategory | 'KITS' | 'MINE';
	let SECTIONS = $derived<{ id: Section; label: string; hint: string }[]>([
		...PRESET_CATEGORIES.map((c) => ({ id: c as Section, label: c, hint: CATEGORY_HINTS[c] })),
		{ id: 'KITS', label: 'KITS', hint: $t('synth.preset.kitsHint') },
		{ id: 'MINE', label: $t('synth.preset.myPresetsLabel'), hint: $t('synth.preset.mineHint') }
	]);

	let open = $state(false);
	let section: Section | null = $state(null);
	let fileInput: HTMLInputElement | undefined = $state();
	let kitInput: HTMLInputElement | undefined = $state();

	let current = $derived($allPresets[$soundPresetIdx] ?? $allPresets[0]);
	let percussion = $derived(!!$activeTrackRow?.percussion);
	// $locale is read here only to give this $derived a tracked dependency —
	// presetTooltips() itself resolves strings through tr(), which is not reactive.
	let PRESET_TOOLTIPS = $derived.by(() => {
		void $locale;
		return presetTooltips();
	});

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

	/* pointerdown rather than click: a click on the backdrop would otherwise
	   also reach whatever is under it once the backdrop unmounts mid-gesture
	   (see ui/Menu.svelte, which does the same). */
	function closeOnPointer(node: HTMLElement) {
		const h = (e: PointerEvent) => {
			e.preventDefault();
			close();
		};
		node.addEventListener('pointerdown', h);
		return { destroy: () => node.removeEventListener('pointerdown', h) };
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
				aria-label={$t('synth.preset.nameAria')}
			/>
		{:else}
			<button onclick={onPick} role="menuitemradio" aria-checked={isOn} class="press min-h-[24px] flex-1 min-w-0 text-left px-2.5 py-1.5 flex items-center gap-2 cursor-pointer" title={pickTitle}>
				<span class="shrink-0" aria-hidden="true" style="color: {isOn ? '#98c379' : 'rgba(255,255,255,0.5)'}">{isOn ? '●' : '○'}</span>
				<span class="truncate">{name}</span>
			</button>
			<button onclick={() => startRename(list, i)} role="menuitem" class="press min-w-[24px] min-h-[24px] shrink-0 px-1.5 py-1.5 text-white/50 hover:text-[#56b6c2] cursor-pointer transition-colors" title={$t('synth.preset.renameHint', { name })} aria-label={$t('synth.preset.renameAria', { name })}>✎</button>
			<button onclick={onDelete} role="menuitem" class="press min-w-[24px] min-h-[24px] shrink-0 pl-1.5 pr-2.5 py-1.5 text-white/50 hover:text-[#e06c75] cursor-pointer transition-colors" title={$t('synth.preset.removeHint', { name })} aria-label={$t('synth.preset.removeAria', { name })}>✕</button>
		{/if}
	</div>
{/snippet}

<div class="flex items-center gap-1 text-xs">
	<span class="text-white/60 font-bold text-[11px] pl-0.5">PRESET:</span>
	<div class="relative">
		<button
			onclick={toggle}
			aria-haspopup="true"
			aria-expanded={open}
			title={$t('synth.preset.pickHint', { target: percussion ? $t('synth.preset.targetKeyLower') : $t('synth.preset.targetTrackLower'), name: PRESET_TOOLTIPS[current?.name] || current?.name })}
			class="press px-1.5 py-0.5 border rounded-xs font-bold transition-colors cursor-pointer text-xs flex items-center gap-1 {open
				? 'border-[#56b6c2] bg-[#56b6c2] text-black'
				: 'border-white/20 hover:border-[#56b6c2] bg-white/5 hover:bg-white/15 text-white hover:text-[#56b6c2]'}"
		>
			<span>{current?.name}</span>
			<span aria-hidden="true" class="text-[9px] leading-none inline-block transition-transform duration-150" style={open ? 'transform: rotate(180deg)' : undefined}>▼</span>
		</button>

		{#if open}
			<div class="fixed inset-0 z-40" use:closeOnPointer aria-hidden="true"></div>

			<div
				role="menu"
				aria-label={$t('synth.preset.pickHint', { target: percussion ? $t('synth.preset.targetKeyLower') : $t('synth.preset.targetTrackLower'), name: PRESET_TOOLTIPS[current?.name] || current?.name })}
				class="origin-top absolute left-0 top-full mt-1 z-50 min-w-[230px] bg-[#121417] border border-[#56b6c2]/50 rounded-xs shadow-[0_8px_24px_rgba(0,0,0,0.7)] py-1 text-xs font-mono"
				transition:scale={{ duration: 140, start: 0.95, opacity: 0, easing: cubicOut }}
			>
				{#each SECTIONS as sec (sec.id)}
					{@const isOpen = section === sec.id}
					{@const count = sec.id === 'MINE' ? $userPresets.length + $userKits.length : sec.id === 'KITS' ? BUILTIN_KITS.length : SOUND_PRESETS.filter((p) => p.category === sec.id).length}
					<div class="relative" role="presentation" onmouseenter={() => (section = sec.id)}>
						<button
							onclick={() => (section = isOpen ? null : sec.id)}
							onfocus={() => (section = sec.id)}
							role="menuitem"
							aria-haspopup="true"
							aria-expanded={isOpen}
							class="{rowBase} justify-between {isOpen ? rowOn : rowIdle}"
							title={sec.hint}
						>
							<span class="flex items-center gap-2 min-w-0">
								<span class="truncate">{sec.label}</span>
								<span class="text-[10px] text-white/50">{count}</span>
							</span>
							<span class="text-[9px] text-white/60">►</span>
						</button>

						{#if isOpen}
							{#if sec.id !== 'KITS' && sec.id !== 'MINE'}
								{@render flyout(presetList)}
								{#snippet presetList()}
									{#each SOUND_PRESETS as p, idx (p.name)}
										{#if p.category === sec.id}
											<button onclick={() => pick(idx)} role="menuitemradio" aria-checked={$soundPresetIdx === idx} class="{rowBase} {$soundPresetIdx === idx ? rowOn : rowIdle}" title={PRESET_TOOLTIPS[p.name] || p.name}>
												<span class="shrink-0" aria-hidden="true" style="color: {$soundPresetIdx === idx ? '#98c379' : 'rgba(255,255,255,0.5)'}">{$soundPresetIdx === idx ? '●' : '○'}</span>
												<span class="truncate">{p.name}</span>
											</button>
										{/if}
									{/each}
								{/snippet}
							{:else if sec.id === 'KITS'}
								{@render flyout(kitList)}
								{#snippet kitList()}
									<div class="px-2.5 pt-0.5 pb-0.5 text-[10px] font-bold text-white/60 select-none">{$t('synth.preset.builtInLabel')}</div>
									{#each BUILTIN_KITS as kit (kit.name)}
										<button onclick={() => pickKit(kit)} role="menuitem" class="{rowBase} {rowIdle}" title={$t('synth.preset.loadKitHint', { name: kit.name, count: Object.keys(kit.keys).length })}>
											<span class="shrink-0 text-white/50" aria-hidden="true">○</span>
											<span class="truncate">{kit.name}</span>
											<span class="ml-auto text-[10px] text-white/50">{Object.keys(kit.keys).length} keys</span>
										</button>
									{/each}
									{#if $userKits.length}
										<div class="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold text-white/60 border-t border-white/10 mt-1 select-none">{$t('synth.preset.myKitsLabel')}</div>
										{#each $userKits as kit, i (i)}
											{@render editRow('kit', i, kit.name, false, () => pickKit(kit), () => deleteUserKit(i), $t('synth.preset.loadKitShortHint', { name: kit.name, count: Object.keys(kit.keys).length }))}
										{/each}
									{/if}
									<div class="border-t border-white/10 mt-1 pt-1">
										<button onclick={saveKit} role="menuitem" aria-disabled={!percussion} class="{actionRow} {percussion ? 'text-[#98c379] hover:bg-[#98c379]/20' : 'text-white/50 cursor-not-allowed'}" title={percussion ? $t('synth.preset.saveKitOnHint') : $t('synth.preset.saveKitOffHint')}>
											<span class="shrink-0" aria-hidden="true">＋</span>
											<span>{$t('synth.preset.saveTrackAsKit')}</span>
										</button>
										<button onclick={importKit} role="menuitem" class="{actionRow} text-[#56b6c2] hover:bg-[#56b6c2]/20" title={$t('synth.preset.importKitHint')}>
											<span class="shrink-0" aria-hidden="true">▲</span>
											<span>{$t('synth.preset.importKit')}</span>
										</button>
										<button onclick={exportKit} role="menuitem" aria-disabled={!percussion} class="{actionRow} {percussion ? 'text-[#56b6c2] hover:bg-[#56b6c2]/20' : 'text-white/50 cursor-not-allowed'}" title={percussion ? $t('synth.preset.exportKitOnHint') : $t('synth.preset.saveKitOffHint')}>
											<span class="shrink-0" aria-hidden="true">▼</span>
											<span>{$t('synth.preset.exportKit')}</span>
										</button>
									</div>
								{/snippet}
							{:else}
								{@render flyout(mineList)}
								{#snippet mineList()}
									{#if $userPresets.length === 0 && $userKits.length === 0}
										<div class="px-2.5 py-1.5 text-[10px] text-white/50 select-none max-w-[240px]">{$t('synth.preset.noneYet', { target: percussion ? $t('synth.preset.targetKeyLower') : $t('synth.preset.targetTrackLower') })}</div>
									{/if}
									{#if $userPresets.length}
										<div class="px-2.5 pt-0.5 pb-0.5 text-[10px] font-bold text-white/60 select-none">{$t('synth.preset.presetsLabel')}</div>
										{#each $userPresets as p, i (i)}
											{@const idx = SOUND_PRESETS.length + i}
											{@render editRow('preset', i, p.name, $soundPresetIdx === idx, () => pick(idx), () => deleteUserPreset(i), $t('synth.preset.loadPresetHint', { name: p.name, target: percussion ? $t('synth.preset.targetKeyLower') : $t('synth.preset.targetTrackLower') }))}
										{/each}
									{/if}
									{#if $userKits.length}
										<div class="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold text-white/60 select-none {$userPresets.length ? 'border-t border-white/10 mt-1' : ''}">{$t('synth.preset.kitsLabel')}</div>
										{#each $userKits as kit, i (i)}
											{@render editRow('kit', i, kit.name, false, () => pickKit(kit), () => deleteUserKit(i), $t('synth.preset.loadKitShortHint', { name: kit.name, count: Object.keys(kit.keys).length }))}
										{/each}
									{/if}
								{/snippet}
							{/if}
						{/if}
					</div>
				{/each}

				<div class="border-t border-white/10 mt-1 pt-1">
					<button onclick={save} role="menuitem" class="{actionRow} text-[#98c379] hover:bg-[#98c379]/20" title={$t('synth.preset.saveActiveHint', { targetPossessive: percussion ? $t('synth.preset.targetKeyPossessive') : $t('synth.preset.targetTrackPossessive') })}>
						<span class="shrink-0" aria-hidden="true">＋</span>
						<span>{$t('synth.preset.saveActive', { target: percussion ? $t('synth.preset.targetKey') : $t('synth.preset.targetTrack') })}</span>
					</button>
					<button onclick={importPreset} role="menuitem" class="{actionRow} text-[#56b6c2] hover:bg-[#56b6c2]/20" title={$t('synth.preset.importFileHint')}>
						<span class="shrink-0" aria-hidden="true">▲</span>
						<span>{$t('synth.preset.importFile')}</span>
					</button>
					<button onclick={exportPreset} role="menuitem" class="{actionRow} text-[#56b6c2] hover:bg-[#56b6c2]/20" title={$t('synth.preset.exportActiveHint', { targetPossessive: percussion ? $t('synth.preset.targetKeyPossessive') : $t('synth.preset.targetTrackPossessive') })}>
						<span class="shrink-0" aria-hidden="true">▼</span>
						<span>{$t('synth.preset.exportActive', { target: percussion ? $t('synth.preset.targetKey') : $t('synth.preset.targetTrack') })}</span>
					</button>
				</div>
			</div>
		{/if}
	</div>

	<!-- Percussion mode for the active track: every key gets its own sound and
	     the racks edit the active key. Lives here because it changes what the
	     PRESET menu applies to (a key rather than the track). -->
	<Button
		variant="outline"
		color="#c678dd"
		active={percussion}
		sound="toggle"
		onclick={() => toggleTrackPercussion($activeTrackId)}
		class="flex items-center gap-1"
		title={percussion
			? $t('synth.preset.percussionOnHint', { track: $activeTrackRow?.name ?? $t('synth.preset.thisTrack') })
			: $t('synth.preset.percussionOffHint', { track: $activeTrackRow?.name ?? $t('synth.preset.theActiveTrack') })}
	>
		PERC
	</Button>
</div>
