<script lang="ts">
	import { onMount } from 'svelte';
	import { initMidi } from '../../stores/synth-midi';
	import { tryLoadSharedPatch } from '../../stores/synth-patch';
	import TransportBar from './TransportBar.svelte';
	import Module1Oscillators from './modules/Module1Oscillators.svelte';
	import Module2TimbreFusion from './modules/Module2TimbreFusion.svelte';
	import Module3Filter from './modules/Module3Filter.svelte';
	import Module4Envelopes from './modules/Module4Envelopes.svelte';
	import Module5Lfo from './modules/Module5Lfo.svelte';
	import Module6FxEq from './modules/Module6FxEq.svelte';
	import Module7Out from './modules/Module7Out.svelte';
	import PianoRoll from './piano-roll/PianoRoll.svelte';
	import PianoKeyboard from './keyboard/PianoKeyboard.svelte';
	import SettingsModal from './settings/SettingsModal.svelte';

	onMount(() => {
		tryLoadSharedPatch();
		return initMidi();
	});
</script>

<div class="space-y-1.5 flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
	<TransportBar />

	<!-- xl-no-gutter: this really scrolls below xl, where the gutter should be
	     reserved, and is overflow-hidden at xl, where it was holding 10px open for
	     a bar that cannot appear. That is what kept the workstation's right edge
	     inside the header's; the racks' own reserved gutter took the other 10. -->
	<div class="flex-1 min-h-0 flex flex-col gap-1.5 overflow-y-auto xl:overflow-hidden custom-scrollbar xl-no-gutter">
		<!-- Top: modules 1-3 + piano roll/keyboard, side by side once there's enough width to not squeeze either -->
		<div class="flex flex-col xl:flex-1 xl:min-h-0 xl:grid xl:grid-cols-[250px_minmax(0,1fr)] gap-1.5 xl:overflow-hidden">
			<!-- Modules 1-3: own scrollable group — natural content height is the floor (never overlaps),
			     extra vertical space distributes 5:3:3 so tall screens fill instead of leaving whitespace -->
			<div data-tour="synth-side" class="order-2 xl:order-1 flex flex-col gap-1.5 min-w-[260px] xl:min-w-0 xl:h-full xl:overflow-y-auto custom-scrollbar pr-0.5">
				<Module1Oscillators />
				<Module2TimbreFusion />
				<Module3Filter />
			</div>

			<div data-tour="synth-roll" class="order-1 xl:order-2 flex flex-col gap-1.5 min-h-[420px] xl:min-h-0 xl:h-full xl:overflow-hidden">
				<PianoRoll />
				<PianoKeyboard />
			</div>
		</div>

		<!-- Bottom: modules 4-7. Scrolls on both axes below xl, where the 12-col
		     layout has a width floor and would rather scroll sideways than squeeze.
		     No max-width: it used to cap at 1400px and centre, on the theory that
		     the knobs are fixed-size so extra width only stretches empty gutters
		     between them. On a wide screen that reads as the row having given up --
		     600px of dead margin either side of it while the piano roll above runs
		     the full width. The modules span the panel now; each one's contents are
		     centred inside its own cell, so the knobs stay grouped rather than
		     drifting apart. -->
		<!-- max-h rather than a fixed height: the row is 175px of content, and a
		     260px box left 85px of nothing under it while the module column beside
		     the roll was 94px short and scrolling. shrink-0 keeps it from being
		     squeezed; the flex parent gives what it does not take to the row above. -->
		<div data-tour="synth-rack" class="shrink-0 xl:max-h-[260px] h-fit overflow-auto custom-scrollbar no-gutter">
			<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 xl:min-w-[1000px] gap-1.5 text-xs">
				<Module4Envelopes />
				<Module5Lfo />
				<Module6FxEq />
				<Module7Out />
			</div>
		</div>
	</div>
</div>

<SettingsModal />
