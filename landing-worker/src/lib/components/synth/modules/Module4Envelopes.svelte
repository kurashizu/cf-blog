<script lang="ts">
	import { playSound } from '../../../sound';
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
	let sustainVal = $derived(
		activeEnvTab === 'amp' ? ($currentTrack.ampSustain ?? $currentTrack.sustain) : activeEnvTab === 'vcf' ? $currentTrack.filterSustain : 0
	);
	let releaseVal = $derived(
		activeEnvTab === 'amp' ? ($currentTrack.ampRelease ?? $currentTrack.release) : activeEnvTab === 'vcf' ? $currentTrack.filterRelease : 0.01
	);
	let envColor = $derived(activeEnvTab === 'amp' ? '#98c379' : activeEnvTab === 'vcf' ? '#56b6c2' : '#e5c07b');

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

<div class="xl:col-span-3 border border-[#98c379]/40 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between min-h-[155px] shrink-0">
	<div class="flex items-center justify-between font-black text-xs border-b border-white/10 pb-0.5 shrink-0">
		<div class="flex items-center gap-2">
			<span class="text-[#98c379] text-xs font-black">4. ENVELOPES</span>
			<div class="flex items-center gap-1">
				<button
					onclick={() => setTab('amp')}
					title="Amplitude Envelope (AMP) — Shapes volume and loudness contour over time via ADSR"
					class="px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors {activeEnvTab === 'amp'
						? 'border-[#98c379] bg-[#98c379] text-black font-black'
						: 'border-white/20 text-white/60 hover:text-white'}"
				>
					AMP
				</button>
				<button
					onclick={() => setTab('vcf')}
					title="Filter Envelope (VCF) — Sweeps filter cutoff frequency over time via ADSR"
					class="px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors {activeEnvTab === 'vcf'
						? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black'
						: 'border-white/20 text-white/60 hover:text-white'}"
				>
					VCF
				</button>
				<button
					onclick={() => setTab('pit')}
					title="Pitch Envelope (PIT) — Modulates transient oscillator pitch over time (ideal for punchy kick drums and laser FX)"
					class="px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors {activeEnvTab === 'pit'
						? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black'
						: 'border-white/20 text-white/60 hover:text-white'}"
				>
					PIT
				</button>
			</div>
		</div>
		<span class="text-white/40 flex items-center" title="Signal Flow: To LFO & Dynamic Modulation">
			<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
		</span>
	</div>

	<div class="flex gap-1.5 items-center flex-1 min-h-0 my-auto">
		<div class="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5">
			<div class="flex-1 flex items-center justify-center">
				<AdsrVisualizer attack={attackVal} decay={decayVal} sustain={sustainVal} release={releaseVal} color={envColor} />
			</div>
		</div>

		<!-- Fixed width so the four faders never get crushed when the rack is at its narrowest -->
		<div class="w-32 shrink-0 flex items-center justify-around gap-0.5 border-l border-white/10 pl-1 h-full py-0.5">
			<HardwareFader label="A" value={attackVal} min={0.001} max={0.8} step={0.01} color={envColor} height={46} onChange={onAttackChange} />
			<HardwareFader label="D" value={decayVal} min={0.01} max={1.0} step={0.01} color={envColor} height={46} onChange={onDecayChange} />
			<HardwareFader
				label={activeEnvTab === 'pit' ? 'AMT' : 'S'}
				value={sustainVal}
				min={activeEnvTab === 'pit' ? -4 : 0}
				max={activeEnvTab === 'pit' ? 4 : 1.0}
				step={activeEnvTab === 'pit' ? 0.1 : 0.02}
				color={envColor}
				height={46}
				onChange={onThirdChange}
			/>
			<HardwareFader
				label={activeEnvTab === 'pit' ? '-' : 'R'}
				value={releaseVal}
				min={0}
				max={1.5}
				step={0.02}
				color={activeEnvTab === 'pit' ? '#333' : activeEnvTab === 'amp' ? '#98c379' : '#56b6c2'}
				height={46}
				onChange={onFourthChange}
			/>
		</div>
	</div>
</div>
