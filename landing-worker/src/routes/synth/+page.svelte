<script lang="ts">
	import SynthWorkspace from '$lib/components/synth/SynthWorkspace.svelte';
	import { TAB_TITLES } from '$lib/routes-map';
	import { handleImportMidiFile, isMidiFile } from '$lib/stores/synth-import';
	import { handleImportPatchFile } from '$lib/stores/synth-patch';

	/** Depth counter: dragenter/dragleave also fire for every child element. */
	let dragDepth = $state(0);
	let dragging = $derived(dragDepth > 0);

	function accepts(e: DragEvent): boolean {
		return Array.from(e.dataTransfer?.items ?? []).some((i) => i.kind === 'file');
	}

	function onDragEnter(e: DragEvent) {
		if (!accepts(e)) return;
		e.preventDefault();
		dragDepth++;
	}

	function onDragOver(e: DragEvent) {
		if (!accepts(e)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
	}

	function onDragLeave() {
		dragDepth = Math.max(0, dragDepth - 1);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragDepth = 0;
		const file = e.dataTransfer?.files?.[0];
		if (!file) return;
		if (isMidiFile(file)) void handleImportMidiFile(file);
		else if (/\.json$/i.test(file.name)) handleImportPatchFile(file);
	}
</script>

<svelte:head>
	<title>{TAB_TITLES[2]}</title>
</svelte:head>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	ondragenter={onDragEnter}
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
	class="relative flex-1 min-h-0 flex flex-col"
>
	<SynthWorkspace />

	{#if dragging}
		<div class="absolute inset-0 z-[110] border-2 border-dashed border-[#c678dd] bg-black/70 flex items-center justify-center pointer-events-none rounded-sm">
			<div class="text-center font-mono px-4">
				<div class="text-sm sm:text-base font-black text-[#c678dd]">DROP TO LOAD</div>
				<div class="text-[11px] sm:text-xs text-white/60 mt-1">
					.mid → one sequencer track per MIDI track · .json → synth patch
				</div>
			</div>
		</div>
	{/if}
</div>
