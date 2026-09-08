<script lang="ts">
	/**
	 * The ADV view switcher: one control holding both names, in a fixed spot.
	 *
	 * A button that appeared inside whichever view was showing moved as the
	 * views did, and read as an action on the roll rather than a choice between
	 * two panels. This is the same segmented shape the site's own tab bar uses,
	 * for the same reason: the pair is the control, and the highlight says which
	 * of the two you are looking at.
	 */
	import { playSound } from '../../../sound';
	import { t } from '../../../i18n';
	import { centreView, setCentreView, type CentreView } from '../../../stores/synth-view';

	const VIEWS: { id: CentreView; label: string; hint: string }[] = [
		{ id: 'roll', label: 'P.ROLL', hint: 'synthPatch.showRollHint' },
		{ id: 'rack', label: 'RACK', hint: 'synthPatch.showRackHint' }
	];
</script>

<!-- Beside ADV rather than in the panel it switches: the two are one control --
     turn the mode on, then pick the view -- and sitting together in one row says
     that without a frame drawn across the gap between rows. Same language as the
     button next to it: the accent border, the blue, the filled/hollow diamond. -->
<div class="flex items-center gap-0.5 p-0.5 border-2 border-[#61afef]/50 bg-[#61afef]/10 rounded-xs shrink-0">
	{#each VIEWS as v (v.id)}
		{@const on = $centreView === v.id}
		<button
			onclick={() => {
				if (!on) {
					setCentreView(v.id);
					playSound('toggle');
				}
			}}
			title={$t(v.hint)}
			class="press px-1.5 py-0.5 rounded-xs text-[11px] leading-none cursor-pointer transition-all whitespace-nowrap flex items-center gap-1 {on
				? 'bg-gradient-to-b from-[#61afef] to-[#4d8fd6] text-black font-black shadow-[0_0_8px_rgba(97,175,239,0.6)]'
				: 'text-[#61afef]/60 hover:text-[#61afef] hover:bg-[#61afef]/20 font-bold'}"
		>
			<span class="text-[8px] leading-none">{on ? '\u25c6' : '\u25c7'}</span>
			{v.label}
		</button>
	{/each}
</div>
