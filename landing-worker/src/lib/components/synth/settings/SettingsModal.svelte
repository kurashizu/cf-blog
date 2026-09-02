<script lang="ts">
	import { fade, scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
	import { playSound } from '../../../sound';
	import { isSynthSettingsOpen, synthSettingsTab } from '../../../stores/synth-settings';
	import AudioHwTab from './AudioHwTab.svelte';
	import DspTab from './DspTab.svelte';
	import MidiTab from './MidiTab.svelte';
	import VoiceTab from './VoiceTab.svelte';

	const TABS = [
		{ id: 'audio_hw', label: '1. AUDIO & HARDWARE', color: '#56b6c2' },
		{ id: 'dsp', label: '2. BUFFER & IR SPECS', color: '#c678dd' },
		{ id: 'midi', label: '3. MIDI & CONTROLLERS', color: '#e5c07b' },
		{ id: 'voice', label: '4. VOICE & TUNING', color: '#98c379' }
	] as const;

	function close() {
		isSynthSettingsOpen.set(false);
		playSound('click');
	}
</script>

{#if $isSynthSettingsOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs select-none"
		onclick={close}
		transition:fade={{ duration: 180 }}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="w-full max-w-2xl bg-[#121417] border border-[#e5c07b]/40 rounded-xs shadow-[0_0_24px_rgba(0,0,0,0.8),0_0_12px_rgba(229,192,123,0.15)] flex flex-col max-h-[85vh] overflow-hidden"
			onclick={(e) => e.stopPropagation()}
			transition:scale={{ duration: 180, start: 0.96, opacity: 0, easing: cubicOut }}
		>
			<!-- Modal Header -->
			<div class="flex items-center justify-between px-3 py-2 bg-black/60 border-b border-white/10 shrink-0">
				<span class="text-[#e5c07b] font-black text-sm">⚙ SYNTHESIZER ENGINE CONFIG</span>
				<button
					onclick={close}
					class="press w-6 h-6 border border-white/20 hover:border-[#e06c75] hover:bg-[#e06c75]/20 text-white/60 hover:text-[#e06c75] rounded-xs flex items-center justify-center text-xs font-black cursor-pointer transition-colors"
					title="Close Settings (Esc)"
				>
					✕
				</button>
			</div>

			<!-- Modal Tabs Navigation -->
			<div class="flex items-center gap-1 px-3 py-1.5 bg-black/40 border-b border-white/10 shrink-0 text-xs">
				{#each TABS as tab (tab.id)}
					<button
						onclick={() => {
							synthSettingsTab.set(tab.id);
							playSound('click');
						}}
						class="press px-2.5 py-1 rounded-xs border font-black cursor-pointer transition-all {$synthSettingsTab === tab.id
							? 'font-black shadow-xs'
							: 'border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/30'}"
						style={$synthSettingsTab === tab.id
							? `background-color: ${tab.color}; border-color: ${tab.color}; color: #000000;`
							: undefined}
					>
						{tab.label}
					</button>
				{/each}
			</div>

			<!-- Modal Body / Tab Content -->
			<div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4 text-xs font-mono">
				{#key $synthSettingsTab}
					<div in:fade={{ duration: 140 }}>
						{#if $synthSettingsTab === 'audio_hw'}
							<AudioHwTab />
						{:else if $synthSettingsTab === 'dsp'}
							<DspTab />
						{:else if $synthSettingsTab === 'midi'}
							<MidiTab />
						{:else if $synthSettingsTab === 'voice'}
							<VoiceTab />
						{/if}
					</div>
				{/key}
			</div>

			<!-- Modal Footer -->
			<div class="flex items-center justify-between px-4 py-2 bg-black/60 border-t border-white/10 shrink-0 text-xs">
				<span class="text-white/40 text-[11px]">Hardware & buffer parameters apply immediately to Web Audio engine graph.</span>
				<button onclick={close} class="press px-4 py-1 bg-[#e5c07b] text-black font-black rounded-xs hover:opacity-90 cursor-pointer shadow-xs transition-opacity">
					DONE
				</button>
			</div>
		</div>
	</div>
{/if}
