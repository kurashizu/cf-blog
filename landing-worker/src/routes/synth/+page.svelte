<script lang="ts">
	import { t } from '$lib/i18n';
	import SynthWorkspace from '$lib/components/synth/SynthWorkspace.svelte';
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
		else if (/\.(json|json\.gz|gz)$/i.test(file.name)) void handleImportPatchFile(file);
	}

	function dropZone(node: HTMLElement) {
		node.addEventListener('dragenter', onDragEnter);
		node.addEventListener('dragover', onDragOver);
		node.addEventListener('dragleave', onDragLeave);
		node.addEventListener('drop', onDrop);
		return {
			destroy() {
				node.removeEventListener('dragenter', onDragEnter);
				node.removeEventListener('dragover', onDragOver);
				node.removeEventListener('dragleave', onDragLeave);
				node.removeEventListener('drop', onDrop);
			}
		};
	}
</script>

<svelte:head>
	<title>{$t('common.tabTitle.2')}</title>
</svelte:head>

<!-- Drag-and-drop lands here (a .mid or patch file anywhere on the page);
     wired as an action -- it is a drop target, not a control, so it has no
     role and no keyboard path of its own (IMP in the transport is that). -->
<div
	use:dropZone
	class="relative flex-1 min-h-0 flex flex-col"
>
	<SynthWorkspace />

	{#if dragging}
		<div class="absolute inset-0 z-[110] border-2 border-dashed border-[#c678dd] bg-black/70 flex items-center justify-center pointer-events-none rounded-sm">
			<div class="text-center font-mono px-4">
				<div class="text-sm sm:text-base font-black text-[#c678dd]">{$t('synth.drop.title')}</div>
				<div class="text-[11px] sm:text-xs text-white/60 mt-1">
					{$t('synth.drop.body')}
				</div>
			</div>
		</div>
	{/if}
</div>
