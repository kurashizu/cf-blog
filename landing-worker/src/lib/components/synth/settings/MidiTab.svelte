<script lang="ts">
	import { playSound } from '../../../sound';
	import {
		midiConnectedDevice,
		midiDevices,
		selectedMidiDevice,
		setSelectedMidiDevice,
		midiOmniSetting,
		setMidiOmni
	} from '../../../stores/synth-midi';
</script>

<div class="space-y-4">
	<!-- MIDI Input Device Selector -->
	<div class="border border-white/10 bg-black/40 rounded-xs p-3 space-y-3">
		<div class="flex items-center justify-between border-b border-white/10 pb-1">
			<span class="text-[#e5c07b] font-black">CONNECTED MIDI HARDWARE DEVICE</span>
			<span class="text-white/40 text-[10px]">Device Input Selector</span>
		</div>

		<div class="space-y-2 pt-1">
			<div class="flex items-center gap-2">
				<span class="text-white/60">Active Input:</span>
				<span class="text-[#e5c07b] font-bold">{$midiConnectedDevice || 'No physical MIDI device detected'}</span>
			</div>

			{#if $midiDevices.length > 0}
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
					<button
						onclick={() => {
							setSelectedMidiDevice('all');
							playSound('click');
						}}
						class="p-2 border rounded-xs text-left cursor-pointer transition-all {$selectedMidiDevice === 'all'
							? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black'
							: 'border-white/10 bg-white/5 text-white/70 hover:text-white'}"
					>
						<div>ALL CONNECTED DEVICES (OMNI)</div>
						<div class="text-[9px] {$selectedMidiDevice === 'all' ? 'text-black/80' : 'text-white/40'}">Accept input from any attached MIDI keyboard</div>
					</button>
					{#each $midiDevices as dev (dev.id)}
						<button
							onclick={() => {
								setSelectedMidiDevice(dev.id);
								playSound('click');
							}}
							class="p-2 border rounded-xs text-left cursor-pointer transition-all {$selectedMidiDevice === dev.id
								? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black'
								: 'border-white/10 bg-white/5 text-white/70 hover:text-white'}"
						>
							<div class="font-bold truncate">{dev.name}</div>
							<div class="text-[9px] {$selectedMidiDevice === dev.id ? 'text-black/80' : 'text-white/40'}">ID: {dev.id}</div>
						</button>
					{/each}
				</div>
			{:else}
				<div class="p-3 border border-white/5 bg-black/20 rounded-xs text-white/40 text-[11px]">
					Plug in any USB/Bluetooth MIDI keyboard or controller. Chrome/Edge/Firefox will automatically detect and bind inputs without driver installation.
				</div>
			{/if}
		</div>
	</div>

	<!-- MIDI Channel Routing -->
	<div class="border border-white/10 bg-black/40 rounded-xs p-3 space-y-3">
		<div class="flex items-center justify-between border-b border-white/10 pb-1">
			<span class="text-[#e5c07b] font-black">CHANNEL DISPATCH ROUTING</span>
			<span class="text-white/40 text-[10px]">Track Filtering</span>
		</div>

		<div class="flex items-center justify-between pt-1">
			<div>
				<p class="text-white/80 font-bold">{$midiOmniSetting ? 'Omni Mode (All 6 Tracks Layered)' : 'Focused Active Track Only (Strict)'}</p>
				<p class="text-white/40 text-[10px]">
					{$midiOmniSetting
						? 'Incoming MIDI notes broadcast to all 6 tracks simultaneously'
						: 'Incoming MIDI notes trigger strictly the active focused track only'}
				</p>
			</div>
			<button
				onclick={() => {
					setMidiOmni(!$midiOmniSetting);
					playSound('toggle');
				}}
				class="px-3 py-1 rounded-xs border font-black text-xs cursor-pointer transition-all {$midiOmniSetting
					? 'border-[#e5c07b] bg-[#e5c07b] text-black shadow-[0_0_8px_#e5c07b]'
					: 'border-white/20 bg-white/5 text-white/60 hover:text-white'}"
			>
				{$midiOmniSetting ? 'OMNI: ON' : 'OMNI: OFF'}
			</button>
		</div>
	</div>
</div>
