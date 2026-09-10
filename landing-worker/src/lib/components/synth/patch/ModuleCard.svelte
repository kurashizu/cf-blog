<script lang="ts">
	/**
	 * One module on the canvas, built like racks 1-7 rather than like a box with
	 * a label.
	 *
	 * The rack idiom is a bordered panel in the module's own colour, a title bar
	 * carrying its name, a segmented row for the parameter that selects
	 * rather than sweeps, real knobs for the ones that do sweep, and a live curve
	 * where the knobs describe a shape. A patch is easier to read when every
	 * module shows its own settings, so the knobs are here and not in a side
	 * panel that only ever shows one module at a time.
	 */
	import { playSound } from '../../../sound';
	import { t } from '../../../i18n';
	import RotaryKnob from '../../hardware/RotaryKnob.svelte';
	import {
		CONST_KINDS,
		noteName,
		noteNumber,
		WAVE_SHAPES,
		labelGutter,
		type ModuleSpec
	} from '../../../stores/synth-modules';
	import WaveMenu from '../WaveMenu.svelte';
	import PickMenu from './PickMenu.svelte';
	import { previewSamples, previewPath, findCustomWave } from '../../../stores/synth-waves';
	import { getWaveformAbbr, type SynthWaveform, type CustomWave } from '../../../track-data';
	import AdsrVisualizer from '../AdsrVisualizer.svelte';
	import ProbeDisplay from './ProbeDisplay.svelte';
	import { PURE_NODES } from '../../../stores/node-graph';

	let {
		spec,
		nodeId,
		params,
		waves,
		inlet,
		onParam,
		onWave,
		onDrawWave
	}: {
		spec: ModuleSpec;
		nodeId: string;
		params: Record<string, number> | undefined;
		/* Kept apart from `params` because a waveform is a name, not a quantity:
		   see `graphWaves` on TrackData. */
		waves?: Record<string, string>;
		/* What an inlet is carrying, resolved against the whole graph. A card
		   only knows its own id, so anything drawn from a *patched* value -- the
		   pulse width, which has no knob -- has to be told. */
		inlet?: (nodeId: string, port: string, def: number) => number;
		onParam: (key: string, value: number) => void;
		onWave?: (key: string, value: SynthWaveform) => void;
		onDrawWave?: (key: string, editing?: CustomWave) => void;
	} = $props();

	/** The wave a node's picker is set to, defaulting to the first basic shape. */
	function waveOf(key: string): SynthWaveform {
		return (waves?.[`${nodeId}.${key}`] as SynthWaveform) ?? 'sine';
	}

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
	let wavePickers = $derived(spec.params.filter((p) => p.wave));
	let fields = $derived(
		spec.params
			.filter((p) => !p.choices && !p.wave && p.field)
			.map((p) => {
				/* CONST's value takes the range of the kind it was set to: a
				   velocity stops at 1 and a pitch runs to the top of hearing.
				   Leaving one -20000..20000 range for all five made the types
				   cosmetic -- the socket changed colour and the field would still
				   take a number that meant nothing there. */
				if (spec.id !== 'const' || p.key !== 'value') return p;
				const k = CONST_KINDS[Math.round(val('kind', 0))] ?? CONST_KINDS[0];
				return { ...p, min: k.min, max: k.max, step: k.step, unit: k.unit ?? '', notes: !!k.notes };
			})
	);
	let knobs = $derived(spec.params.filter((p) => !p.choices && !p.field && !p.wave));

	/* The LFO's shape, drawn over one cycle. A picture of the wave says which
	   one is selected faster than the word does. */
	/** The shape MAP is set to, sampled across its own range. */
	function curvePath(shape: number): string {
		/* Swept across the range the card is set to, not across 0..1.

		   Sampling the input at 0..1 drew the right picture only while the ranges
		   were still at their defaults. Set X to 200..8000 -- the first thing
		   anyone does with a cutoff -- and all forty samples land below X.LO, so
		   the evaluator clamps every one of them to the low end and the card
		   draws a flat line along the floor whichever shape is chosen. The bend
		   was correct in the sound the whole time; only the drawing of it was
		   measuring the wrong interval. */
		const inLo = val('inLo', 0);
		const inHi = val('inHi', 1);
		const outLo = val('outLo', 0);
		const outHi = val('outHi', 1);
		const pts: string[] = [];
		for (let i = 0; i <= 40; i++) {
			const t = i / 40;
			/* Run through the same function the engine runs, so the drawing cannot
			   drift from the sound. A drawn table lives in the params, which is
			   why they are handed over whole rather than as a shape number. */
			const y = PURE_NODES.map(
				{ get: (port: string, f: number) => (port === 'a' ? inLo + t * (inHi - inLo) : f) },
				(key: string, def: number) => (key === 'shape' ? shape : val(key, def))
			);
			/* Back to 0..1 for drawing, against the range the output actually
			   spans -- a cutoff leaving at 8000 is the top of this picture, not
			   eight thousand times above it. An inverted Y range (Y.LO above
			   Y.HI) draws upside down, which is what it does. */
			const span = outHi - outLo;
			const norm = span === 0 ? 0 : (y - outLo) / span;
			pts.push(`${(t * 100).toFixed(1)},${(25 - Math.max(0, Math.min(1, norm)) * 22).toFixed(1)}`);
		}
		return `M ${pts.join(' L ')}`;
	}

	/** One cycle of a rectangle, `duty` of it high. */
	function pulsePath(duty: number): string {
		const x = Math.round(duty * 100);
		// High for `duty`, then low: two edges, which is the whole shape.
		return `M0 22 L0 6 L${x} 6 L${x} 22 L100 22`;
	}

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
				case 'sawtooth':
					y = 2 * x - 1;
					break;
				case 'square':
					y = x < 0.5 ? 1 : -1;
					break;
				case 'triangle':
					y = 1 - 4 * Math.abs(x - 0.5);
					break;
				default:
					y = Math.sin(2 * Math.PI * x);
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
<div
	class="flex flex-col gap-1 py-1"
	style="padding-left: {padLeft}px; padding-right: {padRight}px"
>
	<!-- The wave picker: what the oscillator is set to, drawn rather than named.

	     A shape is quicker to read than a word, and the drawn tables have no
	     word worth reading -- every one abbreviates to USR, while their curves
	     are all different. The name sits beside it for the built-ins, where the
	     opposite is true: a sine and a triangle are hard to tell apart at 24px.

	     One button, whatever the wave, because the list grows: four shapes plus
	     however many have been drawn. A segmented row would set the card's width
	     from the number of waves, so a player who drew twenty would get a card
	     twenty buttons wide. The menu itself is the one racks 1-7 use. -->
	{#each wavePickers as p (p.key)}
		{@const w = waveOf(p.key)}
		<WaveMenu
			label={p.label}
			value={w}
			color={spec.color}
			sections={['BASIC', 'CUSTOM']}
			compact
			onPick={(nw) => onWave?.(p.key, nw)}
			onParam={() => {}}
			onDraw={() => onDrawWave?.(p.key)}
			onEdit={(cw) => onDrawWave?.(p.key, cw)}
		/>
	{/each}

	<!-- A selector, picked from a list rather than from a row of buttons. The row
	     set the card's width from the number of choices: CONST's five made the
	     widest card in the catalogue and still cut PITCH down to fit its cell. -->
	{#each selectors as p (p.key)}
		{@const stride = p.step && p.step > 1 ? p.step : 1}
		<PickMenu
			label={p.label}
			value={Math.round(val(p.key, p.def) / stride)}
			choices={p.choices ?? []}
			color={spec.color}
			onPick={(i) => {
				onParam(p.key, i * stride);
				/* Changing CONST's type changes what its value is allowed to be, so
				   a number carried over from the last type has to come with it: 128
				   is a legal U8 and not a note, and leaving it would have shown a
				   field the engine would clamp behind the player's back. */
				if (spec.id === 'const' && p.key === 'kind') {
					const k = CONST_KINDS[i] ?? CONST_KINDS[0];
					const held = val('value', k.def);
					const fit = Math.max(k.min, Math.min(k.max, held));
					if (fit !== held) onParam('value', fit);
				}
			}}
		/>
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
	{:else if spec.viz === 'curve'}
		<!-- The bend the value will take, drawn by running the shape rather than
		     by describing it: the card and the sound read the same function, so a
		     curve that looks wrong is wrong. -->
		<div class="bg-black/70 border border-white/15 rounded-xs">
			<svg viewBox="0 0 100 28" class="w-full h-[24px]" preserveAspectRatio="none">
				<path
					d={curvePath(Math.round(val('shape', 0)))}
					fill="none"
					stroke={spec.color}
					stroke-width="1.5"
					vector-effect="non-scaling-stroke"
				/>
			</svg>
		</div>
	{:else if spec.viz === 'pulse'}
		<!-- Drawn from what PW is actually carrying, so the card shows the wave
		     the note will play. Unpatched it resolves to 0.5, which is the square
		     the module boots as; a CONST or an envelope moves the edge here as it
		     moves it in the sound. -->
		{@const duty = Math.min(0.95, Math.max(0.05, inlet?.(nodeId, 'pw', 0.5) ?? 0.5))}
		<div class="bg-black/70 border border-white/15 rounded-xs">
			<svg viewBox="0 0 100 28" class="w-full h-[24px]" preserveAspectRatio="none">
				<path
					d={pulsePath(duty)}
					fill="none"
					stroke={spec.color}
					stroke-width="1.5"
					vector-effect="non-scaling-stroke"
				/>
			</svg>
		</div>
	{:else if spec.viz === 'wave'}
		<div class="bg-black/70 border border-white/15 rounded-xs">
			<svg viewBox="0 0 100 28" class="w-full h-[24px]" preserveAspectRatio="none">
				<path
					d={wavePath(Math.round(val('lfoWave', 0)))}
					fill="none"
					stroke={spec.color}
					stroke-width="1.5"
					vector-effect="non-scaling-stroke"
				/>
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
					{#if (p as { notes?: boolean }).notes}
						<!-- A note, typed as a name. The number underneath is MIDI, which
						     is what the roll and the keyboard use, but nobody thinks in
						     60 -- and "C4" is the same length to read and unambiguous
						     about the octave. Anything unparseable leaves the value
						     alone rather than resetting it to something arbitrary. -->
						<input
							type="text"
							value={noteName(Math.max(p.min, Math.min(p.max, val(p.key, p.def))))}
							onpointerdown={(e) => e.stopPropagation()}
							onchange={(e) => {
								const el = e.currentTarget as HTMLInputElement;
								const n = noteNumber(el.value);
								if (n === null)
									el.value = noteName(Math.max(p.min, Math.min(p.max, val(p.key, p.def))));
								else onParam(p.key, n);
							}}
							class="min-w-0 flex-1 bg-black/60 border border-white/20 rounded-xs px-1 py-0.5 text-[9px] font-mono text-right text-white focus:border-white/60 focus:outline-none"
						/>
					{:else}
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
							class="no-spin min-w-0 flex-1 bg-black/60 border border-white/20 rounded-xs px-1 py-0.5 text-[9px] font-mono text-right text-white focus:border-white/60 focus:outline-none"
						/>
					{/if}
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

<style>
	/* No stepper. The arrows are a browser default on `type="number"`, and at
	   this size they are two targets a pixel apart on a field that is typed
	   into rather than nudged -- and they overlap the value they change. */
	.no-spin::-webkit-outer-spin-button,
	.no-spin::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}
	.no-spin {
		appearance: textfield;
		-moz-appearance: textfield;
	}
</style>
