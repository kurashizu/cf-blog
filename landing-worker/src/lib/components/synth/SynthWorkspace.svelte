<script lang="ts">
	import { onMount } from 'svelte';
	import { initMidi } from '../../stores/synth-midi';
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
		return initMidi();
	});
</script>

<div class="space-y-1.5 flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
	<TransportBar />

	<div class="flex-1 min-h-0 flex flex-col gap-1.5 overflow-y-auto xl:overflow-hidden custom-scrollbar">
		<!-- Top: modules 1-3 + piano roll/keyboard, side by side once there's enough width to not squeeze either -->
		<div class="flex flex-col xl:flex-1 xl:min-h-0 xl:grid xl:grid-cols-[250px_minmax(0,1fr)] gap-1.5 xl:overflow-hidden">
			<!-- Modules 1-3: own scrollable group — natural content height is the floor (never overlaps),
			     extra vertical space distributes 5:3:3 so tall screens fill instead of leaving whitespace -->
			<div class="order-2 xl:order-1 flex flex-col gap-1.5 min-w-[260px] xl:min-w-0 xl:h-full xl:overflow-y-auto custom-scrollbar pr-0.5">
				<Module1Oscillators />
				<Module2TimbreFusion />
				<Module3Filter />
			</div>

			<div class="order-1 xl:order-2 flex flex-col gap-1.5 min-h-[420px] xl:min-h-0 xl:h-full xl:overflow-hidden">
				<PianoRoll />
				<PianoKeyboard />
			</div>
		</div>

		<!-- Bottom: modules 4-7, own scrollable group (both axes — the 12-col layout has a width floor so it scrolls sideways instead of squeezing) -->
		<div class="shrink-0 xl:max-h-[260px] overflow-auto custom-scrollbar">
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
