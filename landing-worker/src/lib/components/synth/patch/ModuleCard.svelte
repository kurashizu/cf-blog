<script lang="ts">
	/**
	 * One module on the canvas, built like racks 1-7 rather than like a box with
	 * a label.
	 *
	 * The rack idiom is a bordered panel in the module's own colour, a title bar
	 * carrying its name and RST, a segmented row for the parameter that selects
	 * rather than sweeps, real knobs for the ones that do sweep, and a live curve
	 * where the knobs describe a shape. A patch is easier to read when every
	 * module shows its own settings, so the knobs are here and not in a side
	 * panel that only ever shows one module at a time.
	 */
	import { playSound } from '../../../sound';
	import { t } from '../../../i18n';
	import RotaryKnob from '../../hardware/RotaryKnob.svelte';
	import AdsrVisualizer from '../AdsrVisualizer.svelte';
	import type { ModuleSpec } from '../../../stores/synth-modules';

	let {
		spec,
		nodeId,
		params,
		onParam,
		onReset
	}: {
		spec: ModuleSpec;
		nodeId: string;
		params: Record<string, number> | undefined;
		onParam: (key: string, value: number) => void;
		onReset: () => void;
	} = $props();

	function val(key: string, def: number): number {
		return params?.[`${nodeId}.${key}`] ?? def;
	}

	let knobs = $derived(spec.params.filter((p) => !p.choices));
	let selectors = $derived(spec.params.filter((p) => p.choices));

	/* The LFO's shape, drawn over one cycle. A picture of the wave says which
	   one is selected faster than the word does. */
	function wavePath(kind: number): string {
		const pts: string[] = [];
		for (let i = 0; i <= 40; i++) {
			const x = i / 40;
			let y: number;
			switch (kind) {
				case 1: y = 2 * x - 1; break;
				case 2: y = x < 0.5 ? 1 : -1; break;
				case 3: y = 1 - 4 * Math.abs(x - 0.5); break;
				default: y = Math.sin(2 * Math.PI * x);
			}
			pts.push(`${(x * 100).toFixed(1)},${(14 - y * 10).toFixed(1)}`);
		}
		return `M ${pts.join(' L ')}`;
	}
</script>

<div class="flex flex-col gap-1 p-1">
	{#each selectors as p (p.key)}
		<div class="grid gap-0.5" style="grid-template-columns: repeat({p.choices?.length ?? 1}, minmax(0, 1fr))">
			{#each p.choices ?? [] as choice, ci (choice)}
				{@const on = Math.round(val(p.key, p.def)) === ci}
				<button
					onpointerdown={(e) => {
						if (e.button !== 2) e.stopPropagation();
					}}
					onclick={() => {
						onParam(p.key, ci);
						playSound('click');
					}}
					title={p.label}
					class="press text-[8px] leading-none py-0.5 px-0 border rounded-xs font-black cursor-pointer transition-colors min-w-0 overflow-hidden text-ellipsis whitespace-nowrap {on
						? 'text-black'
						: 'border-white/20 text-white/60 hover:bg-white/10'}"
					style={on ? `border-color: ${spec.color}; background: ${spec.color}` : ''}
				>
					{choice}
				</button>
			{/each}
		</div>
	{/each}

	{#if spec.viz === 'adsr'}
		<AdsrVisualizer
			attack={val('envA', 0.005)}
			decay={val('envD', 0.2)}
			sustain={val('envS', 60) / 100}
			release={val('envR', 0.2)}
			color={spec.color}
			compact
		/>
	{:else if spec.viz === 'wave'}
		<div class="bg-black/70 border border-white/15 rounded-xs">
			<svg viewBox="0 0 100 28" class="w-full h-[24px]" preserveAspectRatio="none">
				<path d={wavePath(Math.round(val('lfoWave', 0)))} fill="none" stroke={spec.color} stroke-width="1.5" vector-effect="non-scaling-stroke" />
			</svg>
		</div>
	{/if}

	{#if knobs.length}
		<div class="grid grid-cols-2 gap-x-0.5 gap-y-0.5 justify-items-center">
			{#each knobs as p (p.key)}
				<!-- The knob owns the drag, so the module underneath must not also
				     move when a knob is turned; right-click still reaches the canvas
				     to pan, and is the knob's own reset gesture on the way past. -->
				<div
					onpointerdown={(e) => {
						if (e.button !== 2) e.stopPropagation();
					}}
					role="presentation"
				>
					<RotaryKnob
						label={p.label}
						value={val(p.key, p.def)}
						min={p.min}
						max={p.max}
						step={p.step}
						unit={p.unit ?? ''}
						color={spec.color}
						size={26}
						reset={p.def}
						onChange={(v) => onParam(p.key, v)}
					/>
				</div>
			{/each}
		</div>
	{/if}
</div>
