<script lang="ts">
	import { playSound } from '../../../sound';
	import {
		masterTuningSetting,
		setMasterTuning,
		maxPolyphonySetting,
		setMaxPolyphony,
		voiceStealingSetting,
		setVoiceStealing
	} from '../../../stores/synth-settings';

	const TUNING_PRESETS = [432, 440, 442, 444];
	const POLYPHONY_PRESETS = [4, 6, 8, 12, 16];
	const VOICE_STEALING_MODES = [
		{ id: 'oldest', label: 'OLDEST', desc: 'Steals oldest active voice' },
		{ id: 'quietest', label: 'QUIETEST', desc: 'Steals lowest amplitude voice' },
		{ id: 'lowest', label: 'LOWEST PITCH', desc: 'Preserves high melody notes' }
	] as const;
</script>

<div class="space-y-4">
	<!-- Master Concert Tuning -->
	<div class="border border-white/10 bg-black/40 rounded-xs p-3 space-y-3">
		<div class="flex items-center justify-between border-b border-white/10 pb-1">
			<span class="text-[#98c379] font-black">MASTER CONCERT TUNING (A4 STANDARD)</span>
			<span class="text-white/40 text-[10px]">Oscillator Reference Calibration</span>
		</div>

		<div class="flex items-center justify-between pt-1">
			<div>
				<p class="text-white/80 font-bold text-sm">{$masterTuningSetting.toFixed(1)} Hz</p>
				<p class="text-white/40 text-[10px]">Standard Orchestral Pitch calibration</p>
			</div>
			<div class="flex items-center gap-1.5">
				{#each TUNING_PRESETS as f (f)}
					<button
						onclick={() => {
							setMasterTuning(f);
							playSound('click');
						}}
						class="press px-2 py-1 rounded-xs border text-xs font-bold transition-all {Math.abs($masterTuningSetting - f) < 0.1
							? 'border-[#98c379] bg-[#98c379] text-black font-black'
							: 'border-white/15 bg-white/5 text-white/60 hover:text-white'} cursor-pointer"
					>
						{f}Hz
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Polyphony Allocation -->
	<div class="border border-white/10 bg-black/40 rounded-xs p-3 space-y-3">
		<div class="flex items-center justify-between border-b border-white/10 pb-1">
			<span class="text-[#98c379] font-black">POLYPHONY VOICE ALLOCATION LIMIT</span>
			<span class="text-white/40 text-[10px]">Max Simultaneous Voices</span>
		</div>

		<div class="flex items-center justify-between pt-1">
			<div>
				<p class="text-white/80 font-bold">Max Concurrent Voices: {$maxPolyphonySetting}</p>
				<p class="text-white/40 text-[10px]">Protects Web Audio thread from CPU overload</p>
			</div>
			<div class="flex items-center gap-1">
				{#each POLYPHONY_PRESETS as p (p)}
					<button
						onclick={() => {
							setMaxPolyphony(p);
							playSound('click');
						}}
						class="press px-2 py-1 rounded-xs border text-xs font-bold transition-all {$maxPolyphonySetting === p
							? 'border-[#98c379] bg-[#98c379] text-black font-black'
							: 'border-white/15 bg-white/5 text-white/60 hover:text-white'} cursor-pointer"
					>
						{p}
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Voice Stealing Algorithm -->
	<div class="border border-white/10 bg-black/40 rounded-xs p-3 space-y-2.5">
		<div class="flex items-center justify-between border-b border-white/10 pb-1">
			<span class="text-[#98c379] font-black">VOICE STEALING PRIORITY ALGORITHM</span>
			<span class="text-white/40 text-[10px]">Voice Recycling</span>
		</div>

		<div class="grid grid-cols-3 gap-2 pt-1">
			{#each VOICE_STEALING_MODES as item (item.id)}
				<button
					onclick={() => {
						setVoiceStealing(item.id);
						playSound('click');
					}}
					class="press p-2 rounded-xs border text-left cursor-pointer transition-all {$voiceStealingSetting === item.id
						? 'border-[#98c379] bg-[#98c379] text-black font-black'
						: 'border-white/10 bg-white/5 text-white/70 hover:text-white'}"
				>
					<div class="font-bold">{item.label}</div>
					<div class="text-[9px] {$voiceStealingSetting === item.id ? 'text-black/80' : 'text-white/40'}">{item.desc}</div>
				</button>
			{/each}
		</div>
	</div>
</div>
