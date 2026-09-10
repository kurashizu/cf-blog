<script lang="ts">
	/**
	 * The patch bay: a voice drawn as the modules it is made of and the cables
	 * between them.
	 *
	 * Racks 1-7 are the same synth arranged for speed: every control in a fixed
	 * grid, no wiring to do. This is the other way round -- primitives on a
	 * canvas, patched by hand -- and the two are kept apart deliberately. A
	 * track uses one or the other, never both at once, so neither has to explain
	 * itself in terms of the other.
	 */
	import { t } from '../../../i18n';
	import { currentTrack, activeTrackRow, activeKey } from '../../../stores/synth-tracks';
	import PatchCanvas from './PatchCanvas.svelte';

	let percussion = $derived(!!$activeTrackRow?.percussion);
</script>

<div
	class="border border-[#61afef]/40 bg-black/60 rounded-xs flex flex-col min-h-0 flex-1 overflow-hidden"
>
	<div
		class="flex justify-between items-center font-black text-[#61afef] text-xs border-b border-white/10 px-1.5 py-1 shrink-0"
	>
		<div class="flex items-center gap-2">
			<span>PATCH RACK</span>
			<span class="text-white/40 font-normal text-[10px]">
				{$currentTrack.name}{percussion ? ` · KEY ${$activeKey}` : ''}
			</span>
		</div>
		<span class="text-white/30 font-normal text-[9px]">{$t('synthPatch.canvasHint')}</span>
	</div>

	<div class="flex-1 min-h-0 p-1.5 flex">
		<PatchCanvas />
	</div>
</div>
