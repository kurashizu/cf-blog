<script lang="ts">
	import PixelIcon from '../pixel/PixelIcon.svelte';
	import {
		BUILTIN_SONGS,
		builtinSongIdx,
		saveStatus,
		handleNewProject,
		handleLoadBuiltinSong,
		handleSavePatch,
		handleLoadPatch,
		handleExportPatch,
		handleImportPatchFile
	} from '../../stores/synth-patch';

	let fileInput: HTMLInputElement | undefined = $state();
	let isLoadMenuOpen = $state(false);

	function onImportChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) handleImportPatchFile(file);
		if (fileInput) fileInput.value = '';
	}

	function loadLocal() {
		isLoadMenuOpen = false;
		handleLoadPatch();
	}

	function loadBuiltin(idx: number) {
		isLoadMenuOpen = false;
		handleLoadBuiltinSong(idx);
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isLoadMenuOpen) isLoadMenuOpen = false;
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="flex items-center gap-1.5 flex-wrap">
	<div class="flex items-center gap-1.5 bg-[#c678dd]/20 border border-[#c678dd]/60 px-2 py-0.5 rounded-xs mr-0.5 select-none shadow-[0_0_8px_rgba(198,120,221,0.25)]">
		<PixelIcon name="audio" size={14} class="text-[#c678dd]" />
		<span class="font-black text-xs text-white tracking-wider">KRSZ SYNTH</span>
	</div>

	<input bind:this={fileInput} type="file" onchange={onImportChange} accept=".json" class="hidden" />

	<button onclick={handleNewProject} title="New Project — Clear all tracks and reset to blank 64-step sequencer" class="px-2 py-0.5 border border-white/20 text-white/80 hover:border-white/60 hover:text-white rounded-xs font-bold transition-colors cursor-pointer text-xs">
		NEW
	</button>

	<button onclick={handleSavePatch} title="Save Patch — Store all 8-track synth parameters and sequencer notes into browser LocalStorage" class="px-2 py-0.5 border border-[#98c379]/50 text-[#98c379] hover:bg-[#98c379]/20 rounded-xs font-bold transition-colors cursor-pointer text-xs">
		SAVE
	</button>

	<!-- Compact LOAD dropdown: local patch + built-in songs live in the menu, not inline -->
	<div class="relative">
		<button
			onclick={() => (isLoadMenuOpen = !isLoadMenuOpen)}
			title="Load — Local browser patch or a built-in song"
			class="px-2 py-0.5 border rounded-xs font-bold transition-colors cursor-pointer text-xs flex items-center gap-1 {isLoadMenuOpen
				? 'border-[#56b6c2] bg-[#56b6c2] text-black'
				: 'border-[#56b6c2]/50 bg-[#56b6c2]/10 text-[#56b6c2] hover:bg-[#56b6c2]/25'}"
		>
			<span>LOAD</span>
			<span class="text-[9px] leading-none">{isLoadMenuOpen ? '▲' : '▼'}</span>
		</button>

		{#if isLoadMenuOpen}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="fixed inset-0 z-40" onclick={() => (isLoadMenuOpen = false)}></div>

			<div class="absolute left-0 top-full mt-1 z-50 min-w-[290px] bg-[#121417] border border-[#56b6c2]/50 rounded-xs shadow-[0_8px_24px_rgba(0,0,0,0.7)] py-1 text-xs font-mono">
				<button onclick={loadLocal} class="w-full text-left px-2.5 py-1.5 flex items-center gap-2 text-[#56b6c2] hover:bg-[#56b6c2]/20 cursor-pointer font-bold" title="Restore saved synth parameters and sequencer patterns from browser LocalStorage">
					<span class="shrink-0">▣</span>
					<span>LOCAL PATCH (BROWSER)</span>
				</button>

				<div class="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold text-white/40 border-t border-white/10 mt-1 select-none">BUILT-IN SONGS</div>

				{#each BUILTIN_SONGS as song, idx (song.id)}
					<button
						onclick={() => loadBuiltin(idx)}
						class="w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2 cursor-pointer {$builtinSongIdx === idx
							? 'text-white bg-white/10 font-bold'
							: 'text-white/80 hover:bg-white/10'}"
						title={`Load ${song.name} (${song.bpm} BPM, ${song.meter}, ${song.steps} steps)`}
					>
						<span class="flex items-center gap-2 min-w-0">
							<span class="shrink-0 {$builtinSongIdx === idx ? 'text-[#98c379]' : 'text-white/25'}">{$builtinSongIdx === idx ? '●' : '○'}</span>
							<span class="truncate">{song.name}</span>
						</span>
						<span class="shrink-0 text-[10px] text-white/40">{song.bpm}bpm · {song.meter}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<button onclick={() => fileInput?.click()} class="px-2 py-0.5 border border-white/20 text-white/70 hover:border-white/60 hover:text-white rounded-xs font-bold transition-colors cursor-pointer text-xs" title="Import Patch — Load a previously exported JSON synthesizer patch file">
		IMP
	</button>

	<button onclick={handleExportPatch} class="px-2 py-0.5 border border-white/20 text-white/70 hover:border-white/60 hover:text-white rounded-xs font-bold transition-colors cursor-pointer text-xs" title="Export Patch — Download complete 8-track synthesizer configuration and patterns as a JSON file">
		EXP
	</button>

	{#if $saveStatus}
		<span class="text-[#98c379] font-bold text-xs ml-1">{$saveStatus}</span>
	{/if}
</div>
