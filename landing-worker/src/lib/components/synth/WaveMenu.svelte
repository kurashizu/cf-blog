<script lang="ts">
	import { scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { playSound } from '../../sound';
	import { BASIC_WAVES, NOISE_WAVES, ADVANCED_WAVES, WAVE_PARAM_SPECS, waveParam, getWaveformAbbr, type SynthWaveform, type CustomWave, type WaveParams } from '../../synth';
	import { customWaves, deleteCustomWave, findCustomWave, WAVE_LABELS } from '../../stores/synth-waves';
	import { WAVE_TOOLTIPS } from './tooltips';
	import RotaryKnob from '../hardware/RotaryKnob.svelte';

	/* The same cascading menu as PRESET: sections on the left, the section's
	   waves in a flyout. Waves with knobs (the ADVANCED ones) open a third
	   panel on hover; turning a knob there also selects the wave, so the
	   change is heard, and leaves the menu open. CUSTOM holds the drawn tables
	   with edit / delete, and the DRAW NEW action opens the editor. */
	let {
		label,
		value,
		color,
		params,
		onPick,
		onParam,
		onDraw,
		onEdit
	}: {
		label: string;
		value: SynthWaveform;
		color: string;
		params?: WaveParams;
		onPick: (w: SynthWaveform) => void;
		onParam: (patch: WaveParams) => void;
		onDraw: () => void;
		onEdit: (wave: CustomWave) => void;
	} = $props();

	type SectionId = 'BASIC' | 'NOISE' | 'ADVANCED' | 'CUSTOM';
	const SECTIONS: { id: SectionId; label: string; hint: string; waves: SynthWaveform[] }[] = [
		{ id: 'BASIC', label: 'BASIC', hint: 'The four analogue shapes', waves: BASIC_WAVES },
		{ id: 'NOISE', label: 'NOISE', hint: 'Buffer sources: white noise and the 808 cymbal bank (OSC1 only; on OSC2 they play as a saw)', waves: NOISE_WAVES },
		{ id: 'ADVANCED', label: 'ADVANCED', hint: 'Stacked and tabled waves: sweeping PWM, a five-saw stack, drawbars, a folded sine', waves: ADVANCED_WAVES },
		{ id: 'CUSTOM', label: 'CUSTOM', hint: 'Waves you drew — one cycle, any shape', waves: [] }
	];

	let open = $state(false);
	let section = $state<SectionId | null>(null);
	let paramWave = $state<SynthWaveform | null>(null);
	let trigger = $state<HTMLButtonElement | null>(null);
	let anchor = $state({ left: 0, top: 0 });

	/* The racks column clips horizontally, so the panel cannot live inside
	   it: it is moved to <body> and placed under the trigger with fixed
	   coordinates, which also escapes the layout panel's transform. */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	let current = $derived(findCustomWave(value));
	let shown = $derived(current ? current.name.slice(0, 6) : getWaveformAbbr(value));
	let currentTitle = $derived(current ? `${current.name} — a wave you drew` : WAVE_TOOLTIPS[value] || WAVE_LABELS[value] || value);

	function toggle() {
		open = !open;
		if (open && trigger) {
			const r = trigger.getBoundingClientRect();
			anchor = { left: r.left, top: r.bottom + 4 };
		}
		if (open) section = value.startsWith('custom:') ? 'CUSTOM' : BASIC_WAVES.includes(value) ? 'BASIC' : NOISE_WAVES.includes(value) ? 'NOISE' : 'ADVANCED';
		playSound('click');
	}
	function close() {
		open = false;
		section = null;
		paramWave = null;
	}
	function turn(w: SynthWaveform, key: keyof WaveParams, v: number) {
		onParam({ [key]: v });
		if (value !== w) onPick(w);
	}
	function pick(w: SynthWaveform) {
		onPick(w);
		playSound('click');
		close();
	}
	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) close();
	}

	const rowBase = 'press w-full text-left px-2.5 py-1.5 flex items-center gap-2 cursor-pointer transition-colors';
	const rowIdle = 'text-white/80 hover:bg-white/10';
	const rowOn = 'text-white bg-white/10 font-bold';
	const actionRow = 'press w-full text-left px-2.5 py-1.5 flex items-center gap-2 cursor-pointer font-bold transition-colors';
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#snippet flyout(children: import('svelte').Snippet, scroll: boolean)}
	<!-- Only the CUSTOM list scrolls; the others must not clip their third panel. -->
	<div
		class="absolute left-full top-0 -mt-px ml-0.5 z-50 min-w-[210px] bg-[#121417] border border-[#56b6c2]/50 rounded-xs shadow-[0_8px_24px_rgba(0,0,0,0.7)] py-1 text-xs font-mono {scroll ? 'max-h-[60vh] overflow-y-auto custom-scrollbar' : 'overflow-visible'}"
		transition:scale={{ duration: 120, start: 0.97, opacity: 0, easing: cubicOut }}
	>
		{@render children()}
	</div>
{/snippet}

<div class="relative w-full">
	<button
		bind:this={trigger}
		onclick={toggle}
		title={`${label} waveform — ${currentTitle}`}
		class="press w-full px-1.5 py-0.5 border rounded-xs font-black transition-colors cursor-pointer text-[10px] flex items-center justify-between gap-1 {open
			? 'text-black'
			: 'bg-white/5 hover:bg-white/15 text-white'}"
		style={open ? `background: ${color}; border-color: ${color}` : `border-color: color-mix(in srgb, ${color} 55%, transparent)`}
	>
		<span class="truncate" style={open ? '' : `color: ${color}`}>{shown}</span>
		<span class="text-[8px] leading-none inline-block transition-transform duration-150" style={open ? 'transform: rotate(180deg)' : undefined}>▼</span>
	</button>

	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div use:portal class="fixed inset-0 z-[120]" onclick={close}></div>

		<div
			use:portal
			style="left: {anchor.left}px; top: {anchor.top}px"
			class="origin-top fixed z-[130] min-w-[150px] bg-[#121417] border border-[#56b6c2]/50 rounded-xs shadow-[0_8px_24px_rgba(0,0,0,0.7)] py-1 text-xs font-mono"
			transition:scale={{ duration: 140, start: 0.95, opacity: 0, easing: cubicOut }}
		>
			<div class="px-2.5 pt-0.5 pb-1 text-[10px] font-bold text-white/40 select-none border-b border-white/10 mb-1">{label} WAVE</div>
			{#each SECTIONS as sec (sec.id)}
				{@const isOpen = section === sec.id}
				{@const count = sec.id === 'CUSTOM' ? $customWaves.length : sec.waves.length}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="relative" onmouseenter={() => { section = sec.id; paramWave = null; }}>
					<button onclick={() => (section = isOpen ? null : sec.id)} class="{rowBase} justify-between {isOpen ? rowOn : rowIdle}" title={sec.hint}>
						<span class="flex items-center gap-2 min-w-0">
							<span class="truncate">{sec.label}</span>
							<span class="text-[10px] text-white/30">{count}</span>
						</span>
						<span class="text-[9px] text-white/40">►</span>
					</button>

					{#if isOpen}
						{#if sec.id !== 'CUSTOM'}
							{@render flyout(waveList, false)}
							{#snippet waveList()}
								{#each sec.waves as w (w)}
									{@const on = value === w}
									{@const specs = WAVE_PARAM_SPECS[w]}
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div class="relative" onmouseenter={() => (paramWave = specs ? w : null)}>
										<button onclick={() => pick(w)} class="{rowBase} {on ? rowOn : rowIdle}" title={WAVE_TOOLTIPS[w] || w}>
											<span class="shrink-0 {on ? 'text-[#98c379]' : 'text-white/25'}">{on ? '●' : '○'}</span>
											<span class="truncate">{WAVE_LABELS[w] ?? w}</span>
											{#if specs}<span class="ml-auto pl-2 text-[9px] text-white/40">►</span>{/if}
										</button>
									</div>
								{/each}
								{#if paramWave && WAVE_PARAM_SPECS[paramWave]}
									{@const pw = paramWave}
									{@const specs = WAVE_PARAM_SPECS[pw] ?? []}
									<!-- Pinned to the flyout's top-right corner, so it stays put while the
									     rows are hovered; fixed cells, so a value read-out cannot shift a knob. -->
									<div
										class="absolute left-full top-0 -mt-px ml-0.5 z-50 bg-[#121417] border border-[#56b6c2]/50 rounded-xs shadow-[0_8px_24px_rgba(0,0,0,0.7)] px-1.5 pt-1 pb-1.5 text-xs font-mono"
										transition:scale={{ duration: 120, start: 0.97, opacity: 0, easing: cubicOut }}
									>
										<div class="text-[10px] font-bold text-white/40 select-none border-b border-white/10 pb-0.5 mb-1 whitespace-nowrap">{getWaveformAbbr(pw)} PARAMS</div>
										<div class="grid gap-y-1" style="grid-template-columns: repeat({Math.min(3, specs.length)}, 44px)">
											{#each specs as sp (sp.key)}
												<div class="flex justify-center">
													<RotaryKnob label={sp.label} value={waveParam(params, sp.key)} min={sp.min} max={sp.max} step={sp.step} unit={sp.unit} {color} size={30} reset={sp.def} description={sp.hint} onChange={(v) => turn(pw, sp.key, v)} />
												</div>
											{/each}
										</div>
									</div>
								{/if}
							{/snippet}
						{:else}
							{@render flyout(customList, true)}
							{#snippet customList()}
								{#if $customWaves.length === 0}
									<div class="px-2.5 py-1.5 text-[10px] text-white/30 select-none max-w-[220px]">none yet — draw one below</div>
								{/if}
								{#each $customWaves as cw (cw.id)}
									{@const on = value === `custom:${cw.id}`}
									<div class="relative flex items-center transition-colors {on ? rowOn : rowIdle}">
										<button onclick={() => pick(`custom:${cw.id}`)} class="press flex-1 min-w-0 text-left px-2.5 py-1.5 flex items-center gap-2 cursor-pointer" title={`Use ${cw.name} on ${label}`}>
											<span class="shrink-0 {on ? 'text-[#98c379]' : 'text-white/25'}">{on ? '●' : '○'}</span>
											<span class="truncate">{cw.name}</span>
										</button>
										<button onclick={() => { close(); onEdit(cw); }} class="press shrink-0 px-1.5 py-1.5 text-white/30 hover:text-[#56b6c2] cursor-pointer transition-colors" title={`Edit ${cw.name} (shape and name)`} aria-label={`Edit ${cw.name}`}>✎</button>
										<button onclick={() => { deleteCustomWave(cw.id); playSound('click'); }} class="press shrink-0 pl-1.5 pr-2.5 py-1.5 text-white/30 hover:text-[#e06c75] cursor-pointer transition-colors" title={`Remove ${cw.name}`} aria-label={`Remove ${cw.name}`}>✕</button>
									</div>
								{/each}
								<div class="border-t border-white/10 mt-1 pt-1">
									<button onclick={() => { close(); onDraw(); }} class="{actionRow} text-[#98c379] hover:bg-[#98c379]/20" title="Draw one cycle of a wave with the mouse; it is saved in this browser and applied here">
										<span class="shrink-0">＋</span>
										<span>DRAW NEW…</span>
									</button>
								</div>
							{/snippet}
						{/if}
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
