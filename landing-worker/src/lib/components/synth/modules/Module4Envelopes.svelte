<script lang="ts">
	import { playSound } from '../../../sound';
	import { t } from '../../../i18n';
	import { resetRack4 } from '../../../stores/synth-reset';
	import { currentTrack, updateActiveTrack } from '../../../stores/synth-tracks';
	import AdsrVisualizer from '../AdsrVisualizer.svelte';
	import HardwareFader from '../../hardware/HardwareFader.svelte';

	let activeEnvTab = $state<'amp' | 'vcf' | 'pit'>('amp');

	let attackVal = $derived(
		activeEnvTab === 'amp'
			? ($currentTrack.ampAttack ?? $currentTrack.attack)
			: activeEnvTab === 'vcf'
				? $currentTrack.filterAttack
				: ($currentTrack.pitchAttack ?? 0.01)
	);
	let decayVal = $derived(
		activeEnvTab === 'amp'
			? ($currentTrack.ampDecay ?? $currentTrack.decay)
			: activeEnvTab === 'vcf'
				? $currentTrack.filterDecay
				: ($currentTrack.pitchDecay ?? 0.1)
	);
	// PIT's third fader is the pitch-envelope depth in octaves (-4..4). It used
	// to read a hard-coded 0, so the fader could be dragged and never moved.
	let sustainVal = $derived(
		activeEnvTab === 'amp'
			? ($currentTrack.ampSustain ?? $currentTrack.sustain)
			: activeEnvTab === 'vcf'
				? $currentTrack.filterSustain
				: ($currentTrack.pitchEnvAmount ?? 0)
	);
	// The graph's sustain axis is 0-1; show the pitch depth as a fraction of its range.
	let visSustain = $derived(
		activeEnvTab === 'pit' ? Math.min(1, Math.abs(sustainVal) / 4) : sustainVal
	);
	let releaseVal = $derived(
		activeEnvTab === 'amp'
			? ($currentTrack.ampRelease ?? $currentTrack.release)
			: activeEnvTab === 'vcf'
				? $currentTrack.filterRelease
				: 0.01
	);
	let envColor = $derived(
		activeEnvTab === 'amp' ? '#98c379' : activeEnvTab === 'vcf' ? '#56b6c2' : '#e5c07b'
	);

	const ENV_TARGET_KEY = {
		amp: 'synthPanels.env.targetVolume',
		vcf: 'synthPanels.env.targetFilterCutoff',
		pit: 'synthPanels.env.targetPitch'
	} as const;
	let envTarget = $derived($t(ENV_TARGET_KEY[activeEnvTab]));
	let attackDesc = $derived($t('synthPanels.env.attackDesc', { target: envTarget }));
	let decayDesc = $derived($t('synthPanels.env.decayDesc', { target: envTarget }));
	let thirdDesc = $derived(
		activeEnvTab === 'pit'
			? $t('synthPanels.env.pitchAmountDesc')
			: $t('synthPanels.env.sustainDesc', { target: envTarget })
	);
	let releaseDesc = $derived($t('synthPanels.env.releaseDesc', { target: envTarget }));

	function setTab(tab: 'amp' | 'vcf' | 'pit') {
		activeEnvTab = tab;
		playSound('click');
	}

	function onAttackChange(v: number) {
		if (activeEnvTab === 'amp') updateActiveTrack({ ampAttack: v, attack: v });
		else if (activeEnvTab === 'vcf') updateActiveTrack({ filterAttack: v });
		else updateActiveTrack({ pitchAttack: v });
	}
	function onDecayChange(v: number) {
		if (activeEnvTab === 'amp') updateActiveTrack({ ampDecay: v, decay: v });
		else if (activeEnvTab === 'vcf') updateActiveTrack({ filterDecay: v });
		else updateActiveTrack({ pitchDecay: v });
	}
	function onThirdChange(v: number) {
		if (activeEnvTab === 'amp') updateActiveTrack({ ampSustain: v, sustain: v });
		else if (activeEnvTab === 'vcf') updateActiveTrack({ filterSustain: v });
		else updateActiveTrack({ pitchEnvAmount: v });
	}
	function onFourthChange(v: number) {
		if (activeEnvTab === 'amp') updateActiveTrack({ ampRelease: v, release: v });
		else if (activeEnvTab === 'vcf') updateActiveTrack({ filterRelease: v });
	}
</script>

<div
	class="xl:col-span-6 border border-[#98c379]/40 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between min-h-[155px] shrink-0"
>
	<div
		class="flex items-center justify-between font-black text-xs border-b border-white/10 pb-0.5 shrink-0"
	>
		<div class="flex items-center gap-2">
			<span class="text-[#98c379] text-xs font-black">4. ENVELOPES</span>
			<div class="flex items-center gap-1">
				<button
					onclick={() => setTab('amp')}
					title={$t('synthPanels.env.ampTabHint')}
					class="press px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors {activeEnvTab ===
					'amp'
						? 'border-[#98c379] bg-[#98c379] text-black font-black'
						: 'border-white/20 text-white/60 hover:text-white'}"
				>
					AMP
				</button>
				<button
					onclick={() => setTab('vcf')}
					title={$t('synthPanels.env.vcfTabHint')}
					class="press px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors {activeEnvTab ===
					'vcf'
						? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black'
						: 'border-white/20 text-white/60 hover:text-white'}"
				>
					VCF
				</button>
				<button
					onclick={() => setTab('pit')}
					title={$t('synthPanels.env.pitTabHint')}
					class="press px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors {activeEnvTab ===
					'pit'
						? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black'
						: 'border-white/20 text-white/60 hover:text-white'}"
				>
					PIT
				</button>
			</div>
		</div>
		<div class="flex items-center gap-1.5">
			<span class="text-white/40 flex items-center" title={$t('synthPanels.rack.flowToLfo')}>
				<svg
					width="10"
					height="10"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg
				>
			</span>
			<button
				onclick={resetRack4}
				title={$t('synthPanels.rack.resetHint')}
				class="press px-1 py-0.2 text-[9px] rounded-xs font-mono font-bold cursor-pointer transition-colors border border-white/20 text-white/40 hover:text-white hover:border-white/60"
				>R</button
			>
		</div>
	</div>

	<div class="flex gap-1.5 items-center flex-1 min-h-0 my-auto">
		<div class="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5">
			<!-- `min-w-0` here as well as on the parent. A flex item will not
			     shrink below its content's intrinsic width without it, and this one
			     holds an SVG -- so the graph kept its full size, the row overflowed,
			     and the A/D/S/R column was pushed off the panel with R hanging
			     outside the border. The outer div already had it; this inner one is
			     the flex item that actually contains the picture. -->
			<div class="flex-1 min-w-0 flex items-center justify-center">
				<!-- The numbers live here, under the curve, rather than under the
				     faders.

				     They were in both places, which is one too many, and the copy
				     below the faders was what pushed the R fader past the panel edge.
				     The graph is the better home: it already carries the A/D/S/R axis
				     those numbers label, so each value sits under the segment of the
				     envelope it describes. -->
				<AdsrVisualizer
					attack={attackVal}
					decay={decayVal}
					sustain={visSustain}
					release={releaseVal}
					color={envColor}
					stages={activeEnvTab === 'pit' ? ['A', 'D', 'AMT'] : ['A', 'D', 'S', 'R']}
				/>
			</div>
		</div>

		<!-- Fixed width so the four faders never get crushed when the rack is at
		     its narrowest.

		     `items-center`, not `items-stretch`: stretching let each fader size
		     itself independently, so R floated up out of the row and broke the
		     baseline the four labels share. -->
		<div
			class="w-40 shrink-0 flex items-center justify-around gap-1 border-l border-white/10 pl-1.5 pr-0.5 h-full py-0.5 overflow-hidden"
		>
			<!-- A, D and R are times in seconds, so they say so.

			     Without a unit `formatDisplay` falls through to `v <= 1 && max <= 1`
			     and prints a percentage: a 0.4 s attack read "40%", and D the same,
			     while S -- a real 0..1 proportion, the one control in the row a
			     percentage is right for -- read "60%" beside them. Three faders
			     claiming the same units for two different quantities.

			     R escaped only because its max is 1.5, which put it on the decimal
			     branch reading "0.40" -- the same quantity as A in a third format.
			     `ms` is what the rest of the synth already shows a time in (REL on
			     FX, GLIDE on FUSION, FADE on LFO), and it is display-only: the
			     stored value stays in seconds and the drag is untouched. -->
			<HardwareFader
				label="A"
				value={attackVal}
				min={0}
				max={0.8}
				step={0.001}
				unit="ms"
				color={envColor}
				height={46}
				fill
				description={attackDesc}
				showValue={false}
				reset={0}
				onChange={onAttackChange}
			/>
			<HardwareFader
				label="D"
				value={decayVal}
				min={0.01}
				max={1.0}
				step={0.01}
				unit="ms"
				color={envColor}
				height={46}
				fill
				description={decayDesc}
				showValue={false}
				reset={0.01}
				onChange={onDecayChange}
			/>
			<HardwareFader
				label={activeEnvTab === 'pit' ? 'AMT' : 'S'}
				value={sustainVal}
				min={activeEnvTab === 'pit' ? -4 : 0}
				max={activeEnvTab === 'pit' ? 4 : 1.0}
				step={activeEnvTab === 'pit' ? 0.1 : 0.02}
				color={envColor}
				height={46}
				fill
				description={thirdDesc}
				showValue={false}
				reset={activeEnvTab === 'amp' ? 1 : 0}
				onChange={onThirdChange}
			/>
			<!-- The pitch envelope has no release stage; the slot used to hold a
			     greyed-out dummy fader, which read as a broken control. -->
			{#if activeEnvTab !== 'pit'}
				<HardwareFader
					label="R"
					value={releaseVal}
					min={0}
					max={1.5}
					step={0.02}
					unit="ms"
					color={envColor}
					height={46}
				fill
					description={releaseDesc}
					showValue={false}
					reset={activeEnvTab === 'amp' ? 0.02 : 0}
					onChange={onFourthChange}
				/>
			{/if}
		</div>
	</div>
</div>
