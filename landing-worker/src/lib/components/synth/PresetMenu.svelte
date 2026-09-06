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
		handleImportPresetFile
	} from '../../stores/synth-presets';
	import { PRESET_TOOLTIPS } from './tooltips';

	/* Same shape as the LOAD menu in PatchManager: a trigger that names the
	   current pick, a scrim that closes on any outside click, a list. The
	   built-ins come first, grouped by category, then whatever the user saved
	   or imported, then the things that make new entries. Picking a row
	   applies it to the active track straight away. */
	let open = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	let current = $derived($allPresets[$soundPresetIdx] ?? $allPresets[0]);

	/* Rename happens in place: the row turns into an input, Enter or blur
	   commits, Escape puts the old name back. The store dedupes the name, so
	   what ends up shown may carry a suffix. */
	let editing: number | null = $state(null);
	let draft = $state('');
	let editInput: HTMLInputElement | undefined = $state();

	function pick(idx: number) {
		open = false;
		applyPresetAt(idx);
	}

	function save() {
		open = false;
		saveActiveAsPreset();
	}

	function exportPreset() {
		open = false;
		exportActivePreset();
	}

	function importPreset() {
		open = false;
		playSound('click');
		fileInput?.click();
	}

	function onImportChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) handleImportPresetFile(file);
		if (fileInput) fileInput.value = '';
	}

	async function startRename(i: number) {
		editing = i;
		draft = $userPresets[i]?.name ?? '';
		playSound('click');
		await tick();
		editInput?.focus();
		editInput?.select();
	}

	function commitRename() {
		if (editing === null) return;
		renameUserPreset(editing, draft);
		editing = null;
	}

	function cancelRename() {
		editing = null;
	}

	function onEditKeydown(e: KeyboardEvent) {
		// Both keys mean something to the transport and the page; keep them here.
		e.stopPropagation();
		if (e.key === 'Enter') commitRename();
		else if (e.key === 'Escape') cancelRename();
	}

	function close() {
		open = false;
		editing = null;
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) close();
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<input bind:this={fileInput} type="file" onchange={onImportChange} accept=".json,application/json" class="hidden" />

<div class="flex items-center gap-1 text-xs">
	<span class="text-white/60 font-bold text-[11px] pl-0.5">PRESET:</span>
	<div class="relative">
		<button
			onclick={() => {
				if (open) close();
				else open = true;
				playSound('click');
			}}
			title={`Sound preset for the active track — ${PRESET_TOOLTIPS[current?.name] || current?.name}. ↑/↓ cycle presets.`}
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
				class="origin-top absolute left-0 top-full mt-1 z-50 min-w-[260px] max-h-[70vh] overflow-y-auto custom-scrollbar bg-[#121417] border border-[#56b6c2]/50 rounded-xs shadow-[0_8px_24px_rgba(0,0,0,0.7)] py-1 text-xs font-mono"
				transition:scale={{ duration: 140, start: 0.95, opacity: 0, easing: cubicOut }}
			>
				{#each PRESET_CATEGORIES as cat, ci (cat)}
					<div class="px-2.5 pb-0.5 text-[10px] font-bold text-white/40 select-none {ci > 0 ? 'pt-1.5 border-t border-white/10 mt-1' : 'pt-0.5'}">{cat}</div>
					{#each SOUND_PRESETS as p, idx (p.name)}
						{#if (p.category ?? 'SYNTH') === cat}
							<button
								onclick={() => pick(idx)}
								class="press w-full text-left px-2.5 py-1.5 flex items-center gap-2 cursor-pointer transition-colors {$soundPresetIdx === idx
									? 'text-white bg-white/10 font-bold'
									: 'text-white/80 hover:bg-white/10'}"
								title={PRESET_TOOLTIPS[p.name] || p.name}
							>
								<span class="shrink-0 {$soundPresetIdx === idx ? 'text-[#98c379]' : 'text-white/25'}">{$soundPresetIdx === idx ? '●' : '○'}</span>
								<span class="truncate">{p.name}</span>
							</button>
						{/if}
					{/each}
				{/each}

				<div class="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold text-white/40 border-t border-white/10 mt-1 select-none">MY PRESETS</div>
				{#if $userPresets.length === 0}
					<div class="px-2.5 py-1.5 text-[10px] text-white/30 select-none">none yet — save the active track, or import a file</div>
				{:else}
					{#each $userPresets as p, i (i)}
						{@const idx = SOUND_PRESETS.length + i}
						<div
							class="flex items-center transition-colors {$soundPresetIdx === idx ? 'text-white bg-white/10 font-bold' : 'text-white/80 hover:bg-white/10'}"
						>
							{#if editing === i}
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
									aria-label="Preset name"
								/>
							{:else}
								<button onclick={() => pick(idx)} class="press flex-1 min-w-0 text-left px-2.5 py-1.5 flex items-center gap-2 cursor-pointer" title={`Load preset ${p.name} onto the active track`}>
									<span class="shrink-0 {$soundPresetIdx === idx ? 'text-[#98c379]' : 'text-white/25'}">{$soundPresetIdx === idx ? '●' : '○'}</span>
									<span class="truncate">{p.name}</span>
								</button>
								<button
									onclick={() => startRename(i)}
									class="press shrink-0 px-1.5 py-1.5 text-white/30 hover:text-[#56b6c2] cursor-pointer transition-colors"
									title={`Rename ${p.name}`}
									aria-label={`Rename preset ${p.name}`}
								>
									✎
								</button>
								<button
									onclick={() => deleteUserPreset(i)}
									class="press shrink-0 pl-1.5 pr-2.5 py-1.5 text-white/30 hover:text-[#e06c75] cursor-pointer transition-colors"
									title={`Remove ${p.name} from your presets`}
									aria-label={`Remove preset ${p.name}`}
								>
									✕
								</button>
							{/if}
						</div>
					{/each}
				{/if}

				<div class="border-t border-white/10 mt-1 pt-1">
					<button onclick={save} class="press w-full text-left px-2.5 py-1.5 flex items-center gap-2 text-[#98c379] hover:bg-[#98c379]/20 cursor-pointer font-bold transition-colors" title="Keep the active track's current sound (racks 1-6 and AIR; not volume, pan or notes) as a preset in this browser">
						<span class="shrink-0">＋</span>
						<span>SAVE ACTIVE TRACK</span>
					</button>
					<button onclick={importPreset} class="press w-full text-left px-2.5 py-1.5 flex items-center gap-2 text-[#56b6c2] hover:bg-[#56b6c2]/20 cursor-pointer font-bold transition-colors" title="Import a preset .json onto the active track; it is added to MY PRESETS. Dropping the file anywhere on the page works too.">
						<span class="shrink-0">▲</span>
						<span>IMPORT FILE…</span>
					</button>
					<button onclick={exportPreset} class="press w-full text-left px-2.5 py-1.5 flex items-center gap-2 text-[#56b6c2] hover:bg-[#56b6c2]/20 cursor-pointer font-bold transition-colors" title="Download the active track's sound as a preset .json you can import here later or send to someone">
						<span class="shrink-0">▼</span>
						<span>EXPORT ACTIVE TRACK</span>
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>
