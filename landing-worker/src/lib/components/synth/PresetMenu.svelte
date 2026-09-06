<script lang="ts">
	import { scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
	import { playSound } from '../../sound';
	import {
		SOUND_PRESETS,
		userPresets,
		allPresets,
		soundPresetIdx,
		applyPresetAt,
		saveActiveAsPreset,
		deleteUserPreset,
		exportActivePreset,
		handleImportPresetFile
	} from '../../stores/synth-presets';
	import { PRESET_TOOLTIPS } from './tooltips';

	/* Same shape as the LOAD menu in PatchManager: a trigger that names the
	   current pick, a scrim that closes on any outside click, a list. The
	   built-ins come first, then whatever the user saved or imported, then the
	   things that make new entries. Picking a row applies it to the active
	   track straight away -- the trigger no longer needs a separate "apply"
	   click the way the old cycle did. */
	let open = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	let current = $derived($allPresets[$soundPresetIdx] ?? $allPresets[0]);

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

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) open = false;
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<input bind:this={fileInput} type="file" onchange={onImportChange} accept=".json,application/json" class="hidden" />

<div class="flex items-center gap-1 text-xs">
	<span class="text-white/60 font-bold text-[11px] pl-0.5">PRESET:</span>
	<div class="relative">
		<button
			onclick={() => {
				open = !open;
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
			<div class="fixed inset-0 z-40" onclick={() => (open = false)}></div>

			<div
				class="origin-top absolute left-0 top-full mt-1 z-50 min-w-[260px] bg-[#121417] border border-[#56b6c2]/50 rounded-xs shadow-[0_8px_24px_rgba(0,0,0,0.7)] py-1 text-xs font-mono"
				transition:scale={{ duration: 140, start: 0.95, opacity: 0, easing: cubicOut }}
			>
				<div class="px-2.5 pt-0.5 pb-0.5 text-[10px] font-bold text-white/40 select-none">BUILT-IN</div>
				{#each SOUND_PRESETS as p, idx (p.name)}
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
				{/each}

				<div class="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold text-white/40 border-t border-white/10 mt-1 select-none">MY PRESETS</div>
				{#if $userPresets.length === 0}
					<div class="px-2.5 py-1.5 text-[10px] text-white/30 select-none">none yet — save the active track, or import a file</div>
				{:else}
					{#each $userPresets as p, i (p.name)}
						{@const idx = SOUND_PRESETS.length + i}
						<div
							class="flex items-center transition-colors {$soundPresetIdx === idx ? 'text-white bg-white/10 font-bold' : 'text-white/80 hover:bg-white/10'}"
						>
							<button onclick={() => pick(idx)} class="press flex-1 min-w-0 text-left px-2.5 py-1.5 flex items-center gap-2 cursor-pointer" title={`Load preset ${p.name} onto the active track`}>
								<span class="shrink-0 {$soundPresetIdx === idx ? 'text-[#98c379]' : 'text-white/25'}">{$soundPresetIdx === idx ? '●' : '○'}</span>
								<span class="truncate">{p.name}</span>
							</button>
							<button
								onclick={() => deleteUserPreset(i)}
								class="press shrink-0 px-2.5 py-1.5 text-white/30 hover:text-[#e06c75] cursor-pointer transition-colors"
								title={`Remove ${p.name} from your presets`}
								aria-label={`Remove preset ${p.name}`}
							>
								✕
							</button>
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
