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
	import { CONST_KINDS, WAVE_SHAPES, labelGutter } from '../../../stores/synth-modules';
	import AdsrVisualizer from '../AdsrVisualizer.svelte';
	import type { ModuleSpec } from '../../../stores/synth-modules';
	import ProbeDisplay from './ProbeDisplay.svelte';

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

	/* How much room the port labels need on either side.
	
	   The canvas draws them over the card's edges, so the controls have to keep
	   out of the way -- and a fixed padding is a guess that was wrong twice.
	   OSC's FREQ label ran under its own waveform buttons at 24px, because the
	   label is four characters of 7px monospace starting 14px in.
	
	   Measured from the longest label the card actually carries, so a module
	   with only short ones is not padded for a long one it does not have. */
	/* The same gutter the canvas sized the card with, imported rather than
	   restated: the controls sit inside the width `moduleWidth` chose, so a
	   second copy of the formula is two numbers that must agree and nothing
	   making them. */
	let padLeft = $derived(labelGutter(spec.inputs));
	let padRight = $derived(labelGutter(spec.outputs));

	/* Three kinds of control, because they answer three kinds of question:
	   "which one" is a row of buttons, "what number exactly" is a field you
	   type into, and "how much" is a dial you turn by feel. */
	let selectors = $derived(spec.params.filter((p) => p.choices));
	let fields = $derived(
		spec.params
			.filter((p) => !p.choices && p.field)
			.map((p) => {
				/* CONST's value takes the range of the kind it was set to: a
				   velocity stops at 1 and a pitch runs to the top of hearing.
				   Leaving one -20000..20000 range for all five made the types
				   cosmetic -- the socket changed colour and the field would still
				   take a number that meant nothing there. */
				if (spec.id !== 'const' || p.key !== 'value') return p;
				const k = CONST_KINDS[Math.round(val('kind', 0))] ?? CONST_KINDS[0];
				return { ...p, min: k.min, max: k.max, step: k.step, unit: k.unit ?? '' };
			})
	);
	let knobs = $derived(spec.params.filter((p) => !p.choices && !p.field));

	/* The LFO's shape, drawn over one cycle. A picture of the wave says which
	   one is selected faster than the word does. */
	function wavePath(kind: number): string {
		/* Drawn by the shape's *name*, not by its index. Switching on the number
		   made this a third hand-written copy of the wave order, and it was the
		   copy nobody corrected: the card drew a ramp for TRI and a square for
		   SAW while the engine played the other way round. */
		const shape = WAVE_SHAPES[Math.round(kind)]?.type ?? 'sine';
		const pts: string[] = [];
		for (let i = 0; i <= 40; i++) {
			const x = i / 40;
			let y: number;
			switch (shape) {
				case 'sawtooth': y = 2 * x - 1; break;
				case 'square': y = x < 0.5 ? 1 : -1; break;
				case 'triangle': y = 1 - 4 * Math.abs(x - 0.5); break;
				default: y = Math.sin(2 * Math.PI * x);
			}
			pts.push(`${(x * 100).toFixed(1)},${(14 - y * 10).toFixed(1)}`);
		}
		return `M ${pts.join(' L ')}`;
	}
</script>

<!-- Wider side padding than top and bottom: the port labels are drawn over the
     card's edges by the canvas, so the controls need a gutter to keep out of.
     Twelve pixels was not enough once the labels moved clear of the sockets --
     OSC's waveform row ran under its own FREQ label. The old note said they sat
     right against
     the knob names -- IN touching AMT, OUT touching BIAS. The gutter is theirs. -->
<div class="flex flex-col gap-1 py-1" style="padding-left: {padLeft}px; padding-right: {padRight}px">
	{#each selectors as p (p.key)}
		<div class="grid gap-0.5" style="grid-template-columns: repeat({p.choices?.length ?? 1}, minmax(0, 1fr))">
			{#each p.choices ?? [] as choice, ci (choice)}
				{@const stride = p.step && p.step > 1 ? p.step : 1}
				{@const stored = ci * stride}
				{@const on = Math.round(val(p.key, p.def) / stride) === ci}
				<button
					onpointerdown={(e) => {
						if (e.button !== 2) e.stopPropagation();
					}}
					onclick={() => {
						/* A selector writes the value, not the button's position.
						   They are the same number when the choices step by one --
						   which is every wave selector -- but TUBE's ODD is a
						   switch on a 0..100 scale that racks 1-7 share, so
						   writing the index would have stored 1 where the engine
						   expects 100. */
						onParam(p.key, stored);
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

	{#if spec.viz === 'scope' || spec.viz === 'fft' || spec.viz === 'meter'}
		<ProbeDisplay
			kind={spec.viz}
			{nodeId}
			color={spec.color}
			params={Object.fromEntries(spec.params.map((q) => [q.key, val(q.key, q.def)]))}
		/>
	{:else if spec.viz === 'adsr'}
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

	{#if fields.length}
		<!-- Typed, not turned. A literal is a number you know in advance, and a
		     dial cannot spell out 440 -- see the `field` note in synth-modules. -->
		<div class="flex flex-col gap-0.5">
			{#each fields as p (p.key)}
				<label class="flex items-center gap-1 text-[8px] font-mono font-bold leading-none">
					<span class="shrink-0 opacity-70" style="color: {spec.color}">{p.label}</span>
					<input
						type="number"
						value={val(p.key, p.def)}
						min={p.min}
						max={p.max}
						step={p.step}
						onpointerdown={(e) => e.stopPropagation()}
						oninput={(e) => {
							const v = Number((e.currentTarget as HTMLInputElement).value);
							if (Number.isFinite(v)) onParam(p.key, Math.max(p.min, Math.min(p.max, v)));
						}}
						class="min-w-0 flex-1 bg-black/60 border border-white/20 rounded-xs px-1 py-0.5 text-[9px] font-mono text-right text-white focus:border-white/60 focus:outline-none"
					/>
					{#if p.unit}<span class="shrink-0 opacity-50">{p.unit}</span>{/if}
				</label>
			{/each}
		</div>
	{/if}

	{#if knobs.length}
		<div class="grid grid-cols-2 gap-x-0.5 gap-y-0.5 justify-items-center">
			{#each knobs as p (p.key)}
				<!-- The knob owns the drag, so the module underneath must not also
				     move when a knob is turned; right-click still reaches the canvas
				     to pan, and is the knob's own reset gesture on the way past.
				
				     Only when the press is actually on the dial. RotaryKnob is a
				     flex column -- a round dial with its label under it -- and
				     use:draggable sits on the dial alone, so swallowing every
				     pointerdown on the wrapper killed the card drag across the
				     label and the space either side of it without turning
				     anything. That is most of a knob cell's area, which is why
				     modules felt immovable. -->
				<div
					onpointerdown={(e) => {
						if (e.button === 2) return;
						const dial = (e.target as HTMLElement)?.closest?.('[data-knob-dial]');
						if (dial) e.stopPropagation();
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
						scale={p.scale ?? 'linear'}
						onChange={(v) => onParam(p.key, v)}
					/>
				</div>
			{/each}
		</div>
	{/if}
</div>
