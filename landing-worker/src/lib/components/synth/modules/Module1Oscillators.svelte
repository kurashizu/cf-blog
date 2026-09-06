<script lang="ts">
	import { playSound } from '../../../sound';
	import { t } from '../../../i18n';
	import { resetRack1 } from '../../../stores/synth-reset';
	import type { SynthWaveform, CustomWave, WaveParams } from '../../../synth';
	import { currentTrack, updateActiveTrack } from '../../../stores/synth-tracks';
	import { eqlCompSetting, setEqlComp } from '../../../stores/synth-settings';
	import { customWaves, previewSamples, previewPath, saveCustomWave, updateCustomWave } from '../../../stores/synth-waves';
	import RotaryKnob from '../../hardware/RotaryKnob.svelte';
	import WaveMenu from '../WaveMenu.svelte';
	import WaveDrawDialog from '../WaveDrawDialog.svelte';

	/* Which oscillator the draw dialog is for, and the wave being edited (null = new). */
	let drawFor = $state<1 | 2 | null>(null);
	let editing = $state<CustomWave | null>(null);

	function openDraw(osc: 1 | 2, wave: CustomWave | null) {
		drawFor = osc;
		editing = wave;
		playSound('click');
	}

	function onSaveWave(name: string, samples: number[], id?: string) {
		let waveId = id;
		if (id) updateCustomWave(id, { name, samples });
		else waveId = saveCustomWave(name, samples).id;
		if (drawFor === 1) updateActiveTrack({ osc1Waveform: `custom:${waveId}` });
		else if (drawFor === 2) updateActiveTrack({ osc2Waveform: `custom:${waveId}` });
		drawFor = null;
		editing = null;
	}

	function setWaveParams(patch: WaveParams) {
		updateActiveTrack({ waveParams: { ...($currentTrack.waveParams ?? {}), ...patch } });
	}

	// $customWaves is read so an edited drawing redraws the scope.
	let path1 = $derived.by(() => {
		void $customWaves;
		return previewPath(previewSamples($currentTrack.osc1Waveform, 96, $currentTrack.waveParams));
	});
	let path2 = $derived.by(() => {
		void $customWaves;
		return previewPath(previewSamples($currentTrack.osc2Waveform, 96, $currentTrack.waveParams));
	});
</script>

<div class="border border-[#e5c07b]/40 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between min-h-[175px] shrink-0 xl:grow-[5]">
	<div class="flex justify-between items-center font-black text-[#e5c07b] text-xs border-b border-white/10 pb-0.5 shrink-0">
		<span class="whitespace-nowrap">1. DUAL OSC</span>
		<div class="flex items-center gap-1.5">
			<span class="text-white/40 flex items-center" title={$t('synthPanels.rack.flowToFusion')}>
				<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
			</span>
			<button onclick={resetRack1} title={$t('synthPanels.rack.resetHint')} class="press px-1 py-0.2 text-[9px] rounded-xs font-mono font-bold cursor-pointer transition-colors border border-white/20 text-white/40 hover:text-white hover:border-white/60">RST</button>
		</div>
	</div>

	<!-- Grouped by meaning. Top, left/right: the two oscillators (wave picker over
	     a wide scope, one per row) beside their two level knobs. Then the loudness
	     switch. Bottom, two rows of four: pitch and shape, then the extra sources. -->
	<div class="flex flex-col flex-1 min-h-0 justify-center gap-1.5 py-1">
		<div class="flex gap-1.5 shrink-0">
			<div class="flex-1 min-w-0 flex flex-col gap-1.5">
				{#each [1, 2] as osc (osc)}
					{@const w = osc === 1 ? $currentTrack.osc1Waveform : $currentTrack.osc2Waveform}
					{@const color = osc === 1 ? '#e5c07b' : '#56b6c2'}
					<div class="flex flex-col gap-1 min-w-0">
						<div class="flex items-center gap-1.5">
							<span class="text-[10px] font-black leading-none shrink-0 w-8" style="color: {color}">OSC{osc}</span>
							<div class="flex-1 min-w-0">
								<WaveMenu
									label={`OSC${osc}`}
									value={w}
									{color}
									params={$currentTrack.waveParams}
									onPick={(nw: SynthWaveform) => updateActiveTrack(osc === 1 ? { osc1Waveform: nw } : { osc2Waveform: nw })}
									onParam={setWaveParams}
									onDraw={() => openDraw(osc as 1 | 2, null)}
									onEdit={(cw) => openDraw(osc as 1 | 2, cw)}
								/>
							</div>
						</div>
						<!-- One cycle of the chosen wave -->
						<svg viewBox="0 0 100 30" preserveAspectRatio="none" class="w-full h-8 border border-white/10 rounded-xs bg-black/40" aria-hidden="true">
							<line x1="0" y1="15" x2="100" y2="15" stroke="rgba(255,255,255,0.15)" stroke-width="0.5" />
							<path d={osc === 1 ? path1 : path2} fill="none" stroke={color} stroke-width="1.2" vector-effect="non-scaling-stroke" />
						</svg>
					</div>
				{/each}
			</div>
			<div class="shrink-0 flex flex-col justify-around items-center border-l border-white/10 pl-1.5">
				<RotaryKnob label="OSC1" value={Math.round($currentTrack.osc1Gain * 100)} min={0} max={100} unit="%" color="#e5c07b" size={32} description={$t('synthPanels.osc.osc1LevelDesc')} reset={100} onChange={(v) => updateActiveTrack({ osc1Gain: v / 100 })} />
				<RotaryKnob label="OSC2" value={Math.round($currentTrack.osc2Gain * 100)} min={0} max={100} unit="%" color="#56b6c2" size={32} description={$t('synthPanels.osc.osc2LevelDesc')} reset={0} onChange={(v) => updateActiveTrack({ osc2Gain: v / 100 })} />
			</div>
		</div>
		<button
			onclick={() => {
				setEqlComp(!$eqlCompSetting);
				playSound('click');
			}}
			title={$t('synthPanels.osc.eqlHint')}
			class="press w-full px-1 py-0.5 text-[9px] rounded-xs font-mono font-bold cursor-pointer transition-colors border shrink-0 {$eqlCompSetting
				? 'bg-[#98c379]/20 border-[#98c379]/60 text-[#98c379]'
				: 'bg-white/5 border-white/20 text-white/40 hover:text-white/70'}"
		>
			EQL:{$eqlCompSetting ? 'AUTO' : 'RAW'}
		</button>

		<div class="grid grid-cols-4 gap-x-0.5 gap-y-1 border-t border-white/10 pt-1.5 shrink-0">
			<RotaryKnob label="DET" value={$currentTrack.detuneCents} min={-50} max={50} step={2} unit="c" color="#e06c75" size={32} reset={0} onChange={(v) => updateActiveTrack({ detuneCents: v })} />
			<RotaryKnob label="SEMI" value={$currentTrack.osc2Semitone ?? 0} min={-24} max={24} step={1} unit="st" color="#c678dd" size={32} reset={0} onChange={(v) => updateActiveTrack({ osc2Semitone: v })} />
			<RotaryKnob label="PW" value={$currentTrack.pulseWidth ?? 50} min={5} max={95} step={5} unit="%" color="#d19a66" size={32} reset={50} onChange={(v) => updateActiveTrack({ pulseWidth: v })} />
			<RotaryKnob label="PHS" value={$currentTrack.phaseOffset} min={0} max={360} step={15} unit="°" color="#98c379" size={32} reset={0} onChange={(v) => updateActiveTrack({ phaseOffset: v })} />
			<RotaryKnob label="SUB" value={Math.round(($currentTrack.subOscGain ?? 0) * 100)} min={0} max={100} unit="%" color="#61afef" size={32} reset={0} onChange={(v) => updateActiveTrack({ subOscGain: v / 100 })} />
			<RotaryKnob label="NOISE" value={Math.round(($currentTrack.noiseGain ?? 0) * 100)} min={0} max={100} unit="%" color="#abb2bf" size={32} reset={0} onChange={(v) => updateActiveTrack({ noiseGain: v / 100 })} />
			<!-- Burst count and spacing for the noise sources -- the 808 clap's
			     stutter. At 1 the GAP does nothing, which is what its dimmed value says. -->
			<RotaryKnob label="RPT" value={$currentTrack.noiseRetrig ?? 1} min={1} max={4} step={1} unit="x" color="#e06c75" size={32} reset={1} onChange={(v) => updateActiveTrack({ noiseRetrig: v })} />
			<RotaryKnob label="GAP" value={$currentTrack.noiseRetrigGap ?? 12} min={5} max={40} step={1} unit="ms" color="#e06c75" size={32} reset={12} onChange={(v) => updateActiveTrack({ noiseRetrigGap: v })} />
		</div>
	</div>
</div>

{#if drawFor}
	<WaveDrawDialog initial={editing} forLabel={`OSC${drawFor}`} onSave={onSaveWave} onClose={() => { drawFor = null; editing = null; }} />
{/if}
