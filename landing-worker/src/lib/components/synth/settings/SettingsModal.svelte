<script lang="ts">
	import { fade } from '$lib/perf-transitions';
	import { t } from '../../../i18n';
	import { isSynthSettingsOpen, synthSettingsTab } from '../../../stores/synth-settings';
	import { Dialog, Button } from '$lib/components/ui';
	import AudioHwTab from './AudioHwTab.svelte';
	import DspTab from './DspTab.svelte';
	import MidiTab from './MidiTab.svelte';
	import VoiceTab from './VoiceTab.svelte';

	const TABS = [
		{ id: 'audio_hw', labelKey: 'synthPanels.settings.tabAudioHw', color: '#56b6c2' },
		{ id: 'dsp', labelKey: 'synthPanels.settings.tabDsp', color: '#c678dd' },
		{ id: 'midi', labelKey: 'synthPanels.settings.tabMidi', color: '#e5c07b' },
		{ id: 'voice', labelKey: 'synthPanels.settings.tabVoice', color: '#98c379' }
	] as const;

	function close() {
		isSynthSettingsOpen.set(false);
	}

	let tabBtns: (HTMLButtonElement | undefined)[] = [];

	/* Left/Right roam the tab strip per the WAI-ARIA tabs pattern; Home/End
	   jump to the ends. Each tab stays a real tab stop (there are only four),
	   so no roving tabindex is needed here. */
	function onTabsKeydown(e: KeyboardEvent) {
		const btns = tabBtns.filter((b): b is HTMLButtonElement => !!b);
		const i = TABS.findIndex((t) => t.id === $synthSettingsTab);
		let next = -1;
		if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
		else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = TABS.length - 1;
		if (next < 0) return;
		e.preventDefault();
		synthSettingsTab.set(TABS[next].id);
		btns[next]?.focus();
	}
</script>

{#if $isSynthSettingsOpen}
	<Dialog
		title={$t('synthPanels.settings.title')}
		short="CONFIG"
		label={$t('synthPanels.settings.title')}
		onClose={close}
		size="lg"
		bodyClass="flex flex-col max-h-[85vh] overflow-hidden p-0"
	>
		<!-- Tabs Navigation -->
		<div
			role="tablist"
			aria-label={$t('synthPanels.settings.title')}
			onkeydown={onTabsKeydown}
			tabindex="-1"
			class="flex items-center gap-1 px-3 py-1.5 bg-black/40 border-b border-white/10 shrink-0 text-xs"
		>
			{#each TABS as tab, i (tab.id)}
				<button
					bind:this={tabBtns[i]}
					role="tab"
					id="synth-settings-tab-{tab.id}"
					aria-selected={$synthSettingsTab === tab.id}
					aria-controls="synth-settings-panel-{tab.id}"
					tabindex={$synthSettingsTab === tab.id ? 0 : -1}
					onclick={() => synthSettingsTab.set(tab.id)}
					class="press px-2.5 py-1 min-h-[24px] rounded-xs border font-black cursor-pointer transition-all {$synthSettingsTab === tab.id
						? 'font-black shadow-xs'
						: 'border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/30'}"
					style={$synthSettingsTab === tab.id
						? `background-color: ${tab.color}; border-color: ${tab.color}; color: #000000;`
						: undefined}
				>
					{$t(tab.labelKey)}
				</button>
			{/each}
		</div>

		<!-- Body / Tab Content -->
		<div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4 text-xs font-mono">
			{#each TABS as tab (tab.id)}
				{#if $synthSettingsTab === tab.id}
					<div id="synth-settings-panel-{tab.id}" role="tabpanel" aria-labelledby="synth-settings-tab-{tab.id}" tabindex="0" in:fade={{ duration: 140 }}>
						{#if tab.id === 'audio_hw'}
							<AudioHwTab />
						{:else if tab.id === 'dsp'}
							<DspTab />
						{:else if tab.id === 'midi'}
							<MidiTab />
						{:else if tab.id === 'voice'}
							<VoiceTab />
						{/if}
					</div>
				{/if}
			{/each}
		</div>

		<!-- Footer -->
		<div class="flex items-center justify-between px-4 py-2 bg-black/60 border-t border-white/10 shrink-0 text-xs">
			<span class="text-white/60 text-[11px]">{$t('synthPanels.settings.footerNote')}</span>
			<Button variant="solid" color="#e5c07b" onclick={close}>
				{$t('common.done')}
			</Button>
		</div>
	</Dialog>
{/if}
