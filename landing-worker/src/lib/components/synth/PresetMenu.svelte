<script lang="ts">
	import { tick } from 'svelte';
	import { t, locale } from '$lib/i18n';
	import { scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
	import { playSound } from '../../sound';
	import {
		SOUND_PRESETS,
		PRESET_CATEGORIES,
		userPresets,
		allPresets,
		soundPresetIdx,
		activeKitName,
		applyPresetAt,
		saveActiveAsPreset,
		newPreset,
		newAdvancedPreset,
		presetModified,
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
	import { advancedMode, toggleAdvanced } from '../../stores/synth-view';
	import ViewTabs from './patch/ViewTabs.svelte';
	import { presetTooltips } from './tooltips';

	/* A cascading menu, like a DAW's browser: the first level is categories,
	   the second is the entries in the one you are over. The list used to be
	   one long column, twenty rows before you reached your own presets, and it
	   only gets longer. Now it is five rows, and each flyout is short enough
	   to read at a glance. Hover opens a flyout; so does click, for touch. */
	/* DRUM is the kits: a single snare is not something a player picks, so the
	   drums are only reachable as a kit and that section lists them. */
	type Section = PresetCategory | 'MINE';
	let SECTIONS = $derived<{ id: Section; label: string; hint: string }[]>([
		...PRESET_CATEGORIES.map((c) => ({ id: c as Section, label: c, hint: CATEGORY_HINTS[c] })),
		{ id: 'MINE', label: $t('synth.preset.myPresetsShort'), hint: $t('synth.preset.mineHint') }
	]);

	let open = $state(false);
	let section: Section | null = $state(null);
	let menuEl: HTMLDivElement | undefined = $state();
	let listEl: HTMLDivElement | undefined = $state();

	/* Cap the menu to the gap that actually exists under the button rather than
	   to a fixed fraction of the window: the toolbar wraps, so how far down the
	   trigger sits depends on the width as well as the height. Measured once on
	   open and again on resize, and written as a custom property so the class
	   stays static. */
	function fitMenu() {
		if (!menuEl) return;
		/* Cap the whole window to the gap under the button; the list inside
		   scrolls, so nothing else needs measuring. The floor is small on
		   purpose -- a larger one pushed the panel back off the bottom edge on
		   a short window, which is the bug this cap exists to prevent. */
		const top = menuEl.getBoundingClientRect().top;
		const room = Math.max(120, window.innerHeight - top - 12);
		menuEl.style.setProperty('--krsz-menu-max', `${Math.round(room)}px`);
	}

	$effect(() => {
		if (!open || !menuEl) return;
		fitMenu();
		window.addEventListener('resize', fitMenu);
		return () => window.removeEventListener('resize', fitMenu);
	});
	let fileInput: HTMLInputElement | undefined = $state();
	let kitInput: HTMLInputElement | undefined = $state();

	let current = $derived($allPresets[$soundPresetIdx] ?? $allPresets[0]);
	/* A kit is a whole key table, so no single preset names it; while one is
	   loaded the trigger says the kit rather than a preset the track dropped
	   the moment the kit went on. */
	/* The trigger sits in a fixed toolbar row, so the name cannot set its width:
	   a user preset may be named anything, and "MY FAVOURITE LEAD SOUND" pushed
	   K.MAP and the snap buttons off to the right. Eight characters is what the
	   longest built-in ("HARPSICHORD" -> "HARPSIC…") needs to stay readable; the
	   full name is on the title. */
	const TRIGGER_MAX = 8;
	let triggerName = $derived.by(() => {
		/* Once the track has been edited the name no longer describes the sound,
		   so stop claiming it does. MODIFIED is also the cue that there is
		   something here worth saving. */
		if ($presetModified) return 'MODIFIED';
		const n = $activeKitName ?? current?.name ?? '';
		return n.length > TRIGGER_MAX ? `${n.slice(0, TRIGGER_MAX)}…` : n;
	});
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

	function toggle() {
		if (open) close();
		else {
			open = true;
			// Open on the family the current preset belongs to, so the panel
			// shows where you already are rather than an empty pane.
			section = (current?.category as Section) ?? SECTIONS[0]?.id ?? null;
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

	function startNew() {
		close();
		newPreset();
	}

	function startNewAdvanced() {
		close();
		newAdvancedPreset();
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
	<!-- The right-hand pane. Not a submenu any more: a cascading menu meant one
	     level nested inside another, and the outer one has to scroll, which
	     clips whatever the inner one draws outside it. One window with a column
	     of tabs has no outside to escape from. -->
	<div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
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
			<button onclick={onPick} class="press flex-1 min-w-0 text-left px-2.5 py-1.5 flex items-center gap-2 cursor-pointer" title={pickTitle}>
				<span class="shrink-0 {isOn ? 'text-[#98c379]' : 'text-white/25'}">{isOn ? '●' : '○'}</span>
				<span class="truncate">{name}</span>
			</button>
			<button onclick={() => startRename(list, i)} class="press shrink-0 px-1.5 py-1.5 text-white/30 hover:text-[#56b6c2] cursor-pointer transition-colors" title={$t('synth.preset.renameHint', { name })} aria-label={$t('synth.preset.renameAria', { name })}>✎</button>
			<button onclick={onDelete} class="press shrink-0 pl-1.5 pr-2.5 py-1.5 text-white/30 hover:text-[#e06c75] cursor-pointer transition-colors" title={$t('synth.preset.removeHint', { name })} aria-label={$t('synth.preset.removeAria', { name })}>✕</button>
		{/if}
	</div>
{/snippet}

<div class="flex items-center gap-1 text-xs">
	<!-- Advanced layout: drops modules 1-7 and gives the lower panel to one view,
	     the roll or the patch bay. First in the row and styled apart from the
	     rest -- the others change what the synth sounds like, this one changes
	     what the page is, so it should not read as one more toggle. -->
	<button
		onclick={() => {
			toggleAdvanced();
			playSound('toggle');
		}}
		data-tour="synth-adv"
		class="relative press mr-1 px-2 py-0.5 rounded-xs font-black text-xs cursor-pointer transition-all flex items-center gap-1 border-2 {$advancedMode
			? 'border-[#61afef] bg-gradient-to-b from-[#61afef] to-[#4d8fd6] text-black shadow-[0_0_10px_rgba(97,175,239,0.6)]'
			: 'border-[#61afef]/50 bg-[#61afef]/10 text-[#61afef] hover:bg-[#61afef]/25 hover:border-[#61afef]'}"
		title={$advancedMode ? $t('synth.preset.advancedOnHint') : $t('synth.preset.advancedOffHint')}
	>
		<span class="text-[8px] leading-none">{$advancedMode ? '\u25c6' : '\u25c7'}</span>
		ADV
	</button>
	<!-- The view switcher belongs with ADV, not in the panel it switches: they
	     are one control -- turn the mode on, then pick the view -- and only
	     meaningful together, so it appears here and only while ADV is on. -->
	{#if $advancedMode}
		<ViewTabs />
	{/if}
	<!-- PATCH, not PRESET: this holds two sounds you build and save -- the
	     subtractive voice and the patch bay -- rather than a fixed choice you
	     pick from a list. -->
	<span class="text-white/60 font-bold text-[11px] pl-2">PATCH:</span>
	<div class="relative">
		<button
			onclick={toggle}
			title={$t('synth.preset.pickHint', { target: percussion ? $t('synth.preset.targetKeyLower') : $t('synth.preset.targetTrackLower'), name: $activeKitName ?? (PRESET_TOOLTIPS[current?.name] || current?.name) })}
			class="press px-1.5 py-0.5 border rounded-xs font-bold transition-colors cursor-pointer text-xs flex items-center gap-1 {open
				? 'border-[#56b6c2] bg-[#56b6c2] text-black'
				: 'border-white/20 hover:border-[#56b6c2] bg-white/5 hover:bg-white/15 text-white hover:text-[#56b6c2]'}"
		>
			<span>{triggerName}</span>
			<span class="text-[9px] leading-none inline-block transition-transform duration-150" style={open ? 'transform: rotate(180deg)' : undefined}>▼</span>
		</button>

		{#if open}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="fixed inset-0 z-40" onclick={close}></div>

			<!-- One window rather than a cascade: a strip of tabs across the top,
			     the chosen category's entries under it, the actions along the
			     bottom. Same shape as the site's own tab bar, and nothing has to
			     escape a scrolling ancestor to be seen. -->
			<div
				bind:this={menuEl}
				class="origin-top absolute left-0 top-full mt-1 z-50 w-[460px] max-w-[92vw] flex flex-col bg-[#121417] border border-[#56b6c2]/50 rounded-xs shadow-[0_8px_24px_rgba(0,0,0,0.7)] text-xs font-mono overflow-hidden"
				style="max-height: var(--krsz-menu-max, 60vh)"
				transition:scale={{ duration: 140, start: 0.95, opacity: 0, easing: cubicOut }}
			>
			<!-- Creating comes before browsing: you either start from nothing or
			     pick something that exists, and that choice is the first thing
			     the menu should offer. The two NEWs are one group because the
			     synth has two instruments in it -- a subtractive voice on racks
			     1-7, and a signal path in the patch bay. -->
			<div class="shrink-0 flex items-center gap-1 px-1 py-1 border-b border-white/10">
				<button onclick={startNew} class="press flex-1 px-2 py-1 rounded-xs cursor-pointer font-bold transition-colors flex items-center gap-1.5 border border-[#e5c07b]/40 text-[#e5c07b] hover:bg-[#e5c07b]/20" title={$t('synth.preset.newHint')}>
					<span class="shrink-0">✧</span>
					<span class="truncate">{$t('synth.preset.newLabel')}</span>
				</button>
				<button onclick={startNewAdvanced} class="press flex-1 px-2 py-1 rounded-xs cursor-pointer font-bold transition-colors flex items-center gap-1.5 border border-[#61afef]/40 text-[#61afef] hover:bg-[#61afef]/20" title={$t('synth.preset.newAdvancedHint')}>
					<span class="shrink-0">◆</span>
					<span class="truncate">{$t('synth.preset.newAdvancedLabel')}</span>
				</button>
			</div>

			<div class="flex min-h-0 flex-1">
			<div bind:this={listEl} class="w-[136px] shrink-0 overflow-y-auto custom-scrollbar py-1 border-r border-white/10">
				{#each SECTIONS as sec (sec.id)}
					{@const isOpen = section === sec.id}
					{@const count = sec.id === 'MINE' ? $userPresets.length + $userKits.length : sec.id === 'DRUM' ? BUILTIN_KITS.length : SOUND_PRESETS.filter((p) => p.category === sec.id).length}
					<button
						onclick={() => (section = sec.id)}
						onmouseenter={() => (section = sec.id)}
						class="press w-full px-2 py-1 cursor-pointer transition-colors flex items-center justify-between gap-1 border-l-2 {isOpen
							? 'border-[#56b6c2] bg-[#56b6c2]/15 text-[#56b6c2] font-black'
							: 'border-transparent text-white/60 hover:bg-white/5 hover:text-white font-bold'}"
						title={sec.hint}
					>
						<span class="truncate">{sec.label}</span>
						<span class="text-[9px] shrink-0 {isOpen ? 'text-[#56b6c2]/60' : 'text-white/30'}">{count}</span>
					</button>
				{/each}
			</div>

			<!-- The pane for the selected tab, a sibling of the strip rather than
			     a child of it: one container per level, side by side. -->
			{#each SECTIONS as sec (sec.id)}
				{#if section === sec.id}
							{#if sec.id !== 'DRUM' && sec.id !== 'MINE'}
								{@render flyout(presetList)}
								{#snippet presetList()}
									{#each SOUND_PRESETS as p, idx (p.name)}
										{#if p.category === sec.id}
											<button onclick={() => pick(idx)} class="{rowBase} {$soundPresetIdx === idx ? rowOn : rowIdle}" title={PRESET_TOOLTIPS[p.name] || p.name}>
												<span class="shrink-0 {$soundPresetIdx === idx ? 'text-[#98c379]' : 'text-white/25'}">{$soundPresetIdx === idx ? '●' : '○'}</span>
												<span class="truncate">{p.name}</span>
												<!-- Says which of the synth's two instruments this is, since the
												     patch bay only sounds in ADV and picking one switches the mode. -->
												{#if p.preset.rackChain?.length}
													<span class="shrink-0 ml-auto text-[8px] font-black tracking-wide {$soundPresetIdx === idx ? 'text-black/60' : 'text-[#61afef]/70'}">ADV</span>
												{/if}
											</button>
										{/if}
									{/each}
								{/snippet}
							{:else if sec.id === 'DRUM'}
								{@render flyout(kitList)}
								{#snippet kitList()}
									<div class="px-2.5 pt-0.5 pb-0.5 text-[10px] font-bold text-white/40 select-none">{$t('synth.preset.builtInLabel')}</div>
									{#each BUILTIN_KITS as kit (kit.name)}
										<button onclick={() => pickKit(kit)} class="{rowBase} {rowIdle}" title={$t('synth.preset.loadKitHint', { name: kit.name, count: Object.keys(kit.keys).length })}>
											<span class="shrink-0 text-white/25">○</span>
											<span class="truncate">{kit.name}</span>
											<!-- Says the kit is built in the patch bay, the same badge a patch
											     carries: picking it switches the track into ADV. -->
											{#if Object.values(kit.keys).some((k) => (k as { rackGraph?: { nodes?: unknown[] } }).rackGraph?.nodes?.length)}
												<span class="shrink-0 ml-auto text-[8px] font-black tracking-wide text-[#61afef]/70">ADV</span>
												<span class="text-[10px] text-white/30">{Object.keys(kit.keys).length} keys</span>
											{:else}
												<span class="ml-auto text-[10px] text-white/30">{Object.keys(kit.keys).length} keys</span>
											{/if}
										</button>
									{/each}
									{#if $userKits.length}
										<div class="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold text-white/40 border-t border-white/10 mt-1 select-none">{$t('synth.preset.myKitsLabel')}</div>
										{#each $userKits as kit, i (i)}
											{@render editRow('kit', i, kit.name, false, () => pickKit(kit), () => deleteUserKit(i), $t('synth.preset.loadKitShortHint', { name: kit.name, count: Object.keys(kit.keys).length }))}
										{/each}
									{/if}
									<div class="border-t border-white/10 mt-1 pt-1">
										<button onclick={saveKit} class="{actionRow} {percussion ? 'text-[#98c379] hover:bg-[#98c379]/20' : 'text-white/30 cursor-not-allowed'}" title={percussion ? $t('synth.preset.saveKitOnHint') : $t('synth.preset.saveKitOffHint')}>
											<span class="shrink-0">＋</span>
											<span>{$t('synth.preset.saveTrackAsKit')}</span>
										</button>
										<button onclick={importKit} class="{actionRow} text-[#56b6c2] hover:bg-[#56b6c2]/20" title={$t('synth.preset.importKitHint')}>
											<span class="shrink-0">▲</span>
											<span>{$t('synth.preset.importKit')}</span>
										</button>
										<button onclick={exportKit} class="{actionRow} {percussion ? 'text-[#56b6c2] hover:bg-[#56b6c2]/20' : 'text-white/30 cursor-not-allowed'}" title={percussion ? $t('synth.preset.exportKitOnHint') : $t('synth.preset.saveKitOffHint')}>
											<span class="shrink-0">▼</span>
											<span>{$t('synth.preset.exportKit')}</span>
										</button>
									</div>
								{/snippet}
							{:else}
								{@render flyout(mineList)}
								{#snippet mineList()}
									{#if $userPresets.length === 0 && $userKits.length === 0}
										<div class="px-2.5 py-1.5 text-[10px] text-white/30 select-none max-w-[240px]">{$t('synth.preset.noneYet', { target: percussion ? $t('synth.preset.targetKeyLower') : $t('synth.preset.targetTrackLower') })}</div>
									{/if}
									{#if $userPresets.length}
										<div class="px-2.5 pt-0.5 pb-0.5 text-[10px] font-bold text-white/40 select-none">{$t('synth.preset.presetsLabel')}</div>
										{#each $userPresets as p, i (i)}
											{@const idx = SOUND_PRESETS.length + i}
											{@render editRow('preset', i, p.name, $soundPresetIdx === idx, () => pick(idx), () => deleteUserPreset(i), $t('synth.preset.loadPresetHint', { name: p.name, target: percussion ? $t('synth.preset.targetKeyLower') : $t('synth.preset.targetTrackLower') }))}
										{/each}
									{/if}
									{#if $userKits.length}
										<div class="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold text-white/40 select-none {$userPresets.length ? 'border-t border-white/10 mt-1' : ''}">{$t('synth.preset.kitsLabel')}</div>
										{#each $userKits as kit, i (i)}
											{@render editRow('kit', i, kit.name, false, () => pickKit(kit), () => deleteUserKit(i), $t('synth.preset.loadKitShortHint', { name: kit.name, count: Object.keys(kit.keys).length }))}
										{/each}
									{/if}
								{/snippet}
							{/if}
				{/if}
			{/each}
			{#if !section}
				<div class="flex-1 min-h-0 flex items-center justify-center px-4 py-6 text-[10px] text-white/30 text-center">
					{$t('synth.preset.pickCategoryHint')}
				</div>
			{/if}
			</div>

				<!-- These act on what is loaded now, not on the library, so they
				     sit apart from the browsing above them. -->
				<div class="border-t border-white/10 shrink-0 flex items-center gap-1 px-1 py-1">
					<button onclick={save} class="press flex-1 min-w-0 px-2 py-1 rounded-xs cursor-pointer font-bold transition-colors flex items-center gap-1.5 text-[#98c379] hover:bg-[#98c379]/20" title={$t('synth.preset.saveActiveHint', { targetPossessive: percussion ? $t('synth.preset.targetKeyPossessive') : $t('synth.preset.targetTrackPossessive') })}>
						<span class="shrink-0">＋</span>
						<span>{$t('synth.preset.saveShort')}</span>
					</button>
					<button onclick={importPreset} class="press flex-1 min-w-0 px-2 py-1 rounded-xs cursor-pointer font-bold transition-colors flex items-center gap-1.5 text-[#56b6c2] hover:bg-[#56b6c2]/20" title={$t('synth.preset.importFileHint')}>
						<span class="shrink-0">▲</span>
						<span>{$t('synth.preset.importShort')}</span>
					</button>
					<button onclick={exportPreset} class="press flex-1 min-w-0 px-2 py-1 rounded-xs cursor-pointer font-bold transition-colors flex items-center gap-1.5 text-[#56b6c2] hover:bg-[#56b6c2]/20" title={$t('synth.preset.exportActiveHint', { targetPossessive: percussion ? $t('synth.preset.targetKeyPossessive') : $t('synth.preset.targetTrackPossessive') })}>
						<span class="shrink-0">▼</span>
						<span>{$t('synth.preset.exportShort')}</span>
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
			? $t('synth.preset.percussionOnHint', { track: $activeTrackRow?.name ?? $t('synth.preset.thisTrack') })
			: $t('synth.preset.percussionOffHint', { track: $activeTrackRow?.name ?? $t('synth.preset.theActiveTrack') })}
	>
		<!-- K.MAP, not PERC: the mode is a key map -- every key its own sound --
		     and it is used for far more than percussion. -->
		K.MAP
	</button>

</div>
