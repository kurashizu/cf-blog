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
		{ id: 'roll', label: 'PIANO ROLL', hint: 'synthPatch.showRollHint' },
		{ id: 'rack', label: 'RACK', hint: 'synthPatch.showRackHint' }
	];
</script>

<!-- Deliberately loud, and deliberately the same language as the ADV button
     directly above it: the two-pixel accent border, the blue, the filled/hollow
     diamond. They cannot sit in one row -- ADV lives with PRESET, this lives in
     the panel it switches -- but they line up on the same left edge one row
     apart, so reading down they are plainly one group: turn ADV on, then choose
     which of the two views the panel shows. -->
<div class="viewtabs relative flex items-center gap-0.5 p-0.5 bg-[#61afef]/10 rounded-xs shrink-0">
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
			class="press px-2 py-0.5 rounded-xs text-[11px] leading-none cursor-pointer transition-all whitespace-nowrap flex items-center gap-1 {on
				? 'bg-gradient-to-b from-[#61afef] to-[#4d8fd6] text-black font-black shadow-[0_0_8px_rgba(97,175,239,0.6)]'
				: 'text-[#61afef]/60 hover:text-[#61afef] hover:bg-[#61afef]/20 font-bold'}"
		>
			<span class="text-[8px] leading-none">{on ? '\u25c6' : '\u25c7'}</span>
			{v.label}
		</button>
	{/each}
</div>

<style>
	/* The lower half of the frame ADV opens, and the step between the two: the
	   button above is narrower than this control, so the outline runs up the
	   left, along the top only as far as the button's right edge, and the rest
	   of this control's top edge is drawn as the ledge that steps out to meet
	   it. Measured against the live layout -- the button's frame ends 68px from
	   this control's left edge. */
	.viewtabs::before {
		content: '';
		position: absolute;
		left: -6px;
		right: -5px;
		top: -12px;
		bottom: -4px;
		border: 2px solid rgba(97, 175, 239, 0.55);
		border-top: none;
		border-bottom-left-radius: 5px;
		border-bottom-right-radius: 5px;
		pointer-events: none;
	}

	/* The ledge: the part of this control's top edge that is not covered by the
	   narrower button above, closing the step. */
	.viewtabs::after {
		content: '';
		position: absolute;
		left: 68px;
		right: -5px;
		top: -12px;
		height: 2px;
		background: rgba(97, 175, 239, 0.55);
		pointer-events: none;
	}
</style>
