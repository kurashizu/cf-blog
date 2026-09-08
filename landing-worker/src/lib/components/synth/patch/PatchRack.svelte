<script lang="ts">
	/**
	 * The patch bay: a voice drawn as the chain of processors it actually is.
	 *
	 * Modules 1-7 are the quick panels -- every control, packed into a grid that
	 * cannot grow. This view exists because a signal path you can rewire needs
	 * room those panels do not have, and because the engine's fixed chain is why
	 * a drum fitted to a real recording plateaus: no amount of tuning a filter
	 * produces a 2 ms transient or the saturation of a struck drum.
	 *
	 * Both views edit the same track. A cutoff changed here moves the knob in
	 * module 3; nothing is duplicated.
	 */
	import { playSound } from '../../../sound';
	import { t } from '../../../i18n';
	import ViewTabs from './ViewTabs.svelte';
	import RotaryKnob from '../../hardware/RotaryKnob.svelte';
	import { currentTrack, activeTrackRow, activeKey } from '../../../stores/synth-tracks';
	import {
		RACK_MODULES,
		DEFAULT_CHAIN,
		chainOf,
		setChain,
		moduleSpec,
		paramsOf,
		setParam,
		selectedSlot,
		type RackModuleId
	} from '../../../stores/synth-rack';

	let percussion = $derived(!!$activeTrackRow?.percussion);
	let chain = $derived(chainOf($currentTrack));
	/** Slot being edited; clamped so removing the last slot cannot strand it. */
	let sel = $derived($selectedSlot !== null && $selectedSlot < chain.length ? $selectedSlot : null);
	let selId = $derived(sel !== null ? chain[sel] : null);

	/** Modules not already in the chain -- each stage appears once. */
	let available = $derived(RACK_MODULES.filter((m) => !chain.includes(m.id)));

	let dragFrom = $state<number | null>(null);

	function addModule(id: RackModuleId) {
		setChain([...chain, id]);
		selectedSlot.set(chain.length);
		playSound('click');
	}

	function removeAt(i: number) {
		const next = chain.filter((_, n) => n !== i);
		setChain(next);
		if (sel === i) selectedSlot.set(null);
		playSound('click');
	}

	/** Reorder by drag: the order is the signal path, so it is the whole point. */
	function dropOn(to: number) {
		if (dragFrom === null || dragFrom === to) return;
		const next = [...chain];
		const [moved] = next.splice(dragFrom, 1);
		next.splice(to, 0, moved);
		setChain(next);
		selectedSlot.set(to);
		dragFrom = null;
		playSound('click');
	}

	function resetChain() {
		setChain([...DEFAULT_CHAIN]);
		selectedSlot.set(null);
		playSound('click');
	}
</script>

<div class="border border-[#61afef]/40 bg-black/60 rounded-xs flex flex-col min-h-0 flex-1 overflow-hidden">
	<!-- Header: same shape as every module panel, plus the toggle back to the roll. -->
	<div class="flex justify-between items-center font-black text-[#61afef] text-xs border-b border-white/10 px-1.5 py-1 shrink-0">
		<div class="flex items-center gap-2">
			<!-- The same switcher the roll's header carries, in the same place: the
			     two views share this panel, so the control has to live in both. -->
			<ViewTabs />
			<span class="text-white/40 font-normal text-[10px]">
				{$currentTrack.name}{percussion ? ` · KEY ${$activeKey}` : ''}
			</span>
		</div>
		<div class="flex items-center gap-1.5">
			<button
				onclick={() => {
					resetChain();
				}}
				title={$t('synthPatch.resetHint')}
				class="press px-1 py-0.2 text-[9px] rounded-xs font-mono font-bold cursor-pointer transition-colors border border-white/20 text-white/40 hover:text-white hover:border-white/60"
				>RST</button
			>
		</div>
	</div>

	<div class="flex-1 min-h-0 overflow-auto custom-scrollbar p-2 flex flex-col gap-2">
		<!-- The signal path. SRC and OUT are fixed: every voice has a source and a
		     destination; what sits between them is the patch. -->
		<div class="flex items-stretch gap-1 flex-wrap">
			<div class="flex items-center px-2 py-1.5 border border-white/25 bg-white/5 rounded-xs text-[10px] font-black text-white/70 shrink-0">
				SRC
			</div>
			<div class="flex items-center text-white/25 text-xs shrink-0">→</div>

			{#each chain as id, i (id + i)}
				{@const spec = moduleSpec(id)}
				<div
					role="button"
					tabindex="0"
					draggable="true"
					ondragstart={() => (dragFrom = i)}
					ondragover={(e) => e.preventDefault()}
					ondrop={() => dropOn(i)}
					onclick={() => {
						selectedSlot.set(i);
						playSound('click');
					}}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							selectedSlot.set(i);
						}
					}}
					title={$t(spec?.descKey ?? '')}
					class="group relative flex flex-col items-center justify-center px-2.5 py-1.5 border-2 rounded-xs cursor-grab active:cursor-grabbing transition-all shrink-0 min-w-[52px] {sel ===
					i
						? 'bg-white/10'
						: 'bg-black/40 hover:bg-white/5'}"
					style="border-color: {sel === i ? spec?.color : (spec?.color ?? '#666') + '66'}"
				>
					<span class="font-black text-[11px] leading-none" style="color: {spec?.color}">{spec?.label}</span>
					<span class="text-[8px] text-white/30 leading-none mt-0.5">{i + 1}</span>
					<button
						onclick={(e) => {
							e.stopPropagation();
							removeAt(i);
						}}
						title={$t('synthPatch.removeHint')}
						class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#e06c75] text-black text-[8px] font-black leading-none opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
						>×</button
					>
				</div>
				<div class="flex items-center text-white/25 text-xs shrink-0">→</div>
			{/each}

			<div class="flex items-center px-2 py-1.5 border border-white/25 bg-white/5 rounded-xs text-[10px] font-black text-white/70 shrink-0">
				OUT
			</div>
		</div>

		<!-- Modules not yet patched in. Clicking appends; the chain is then dragged
		     into the order you want, because the order is the sound. -->
		{#if available.length}
			<div class="flex items-center gap-1 flex-wrap border-t border-white/10 pt-2">
				<span class="text-[9px] text-white/35 mr-1">{$t('synthPatch.addLabel')}</span>
				{#each available as m (m.id)}
					<button
						onclick={() => addModule(m.id)}
						title={$t(m.descKey)}
						class="press px-2 py-0.5 border rounded-xs text-[10px] font-black cursor-pointer transition-colors bg-black/40 hover:bg-white/10"
						style="border-color: {m.color}66; color: {m.color}">+ {m.label}</button
					>
				{/each}
			</div>
		{/if}

		<!-- The selected module's own controls. Empty until something is chosen, so
		     the path stays readable while it is being built. -->
		<div class="flex-1 min-h-[80px] border border-white/10 rounded-xs bg-black/40 p-2">
			{#if selId}
				{@const spec = moduleSpec(selId)}
				{@const vals = paramsOf($currentTrack, selId)}
				<div class="flex items-center gap-2 border-b border-white/10 pb-1 mb-2">
					<span class="font-black text-xs" style="color: {spec?.color}">{spec?.label}</span>
					<span class="text-[10px] text-white/40">{$t(spec?.descKey ?? '')}</span>
				</div>
				{#if spec?.params.length}
					<div class="flex flex-wrap items-start gap-x-4 gap-y-2">
						{#each spec.params as p (p.key)}
							<RotaryKnob
								label={p.label}
								value={vals[p.key]}
								min={p.min}
								max={p.max}
								step={p.step}
								unit={p.unit ?? ''}
								color={spec.color}
								size={40}
								reset={p.def}
								onChange={(v) => setParam(p.key, v)}
							/>
						{/each}
					</div>
				{:else}
					<!-- Stages the engine already had: their controls are racks 1-7, and
					     duplicating them here would be two places to change one value. -->
					<div class="text-[10px] text-white/35">{$t('synthPatch.builtInParams')}</div>
				{/if}
			{:else}
				<div class="text-[10px] text-white/30">{$t('synthPatch.pickSlot')}</div>
			{/if}
		</div>
	</div>
</div>
