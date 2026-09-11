<script lang="ts">
	/**
	 * The probe cards, rendered against live analysers.
	 *
	 * A bench for the one thing a rendered envelope cannot show: what the card
	 * draws. SCOPE and LOUD take a control value as well as audio now, and the
	 * whole point of that inlet is the picture -- the axis it is drawn against,
	 * the numbers written on it -- so checking it means looking at the canvas
	 * rather than asserting about samples.
	 *
	 * Feeds the analysers directly rather than building a patch, because what is
	 * under test is ProbeDisplay and not the graph: a ConstantSource at a known
	 * value says exactly what the trace should read, so a wrong picture here is
	 * the card's fault and not the engine's.
	 */
	import { onMount } from 'svelte';
	import { modularSynth } from '$lib/synth';
	import ProbeDisplay from '$lib/components/synth/patch/ProbeDisplay.svelte';

	let ready = $state(false);

	const cases = [
		{ id: 'cv-unit', kind: 'scope' as const, cv: true, value: 0.5, lo: -1, hi: 1, note: 'SCOPE / CV 0.5 in -1..1' },
		{ id: 'cv-hz', kind: 'scope' as const, cv: true, value: 3000, lo: 0, hi: 5000, note: 'SCOPE / CV 3000 in 0..5000' },
		{ id: 'cv-neg', kind: 'scope' as const, cv: true, value: -2, lo: -4, hi: 4, note: 'SCOPE / CV -2 in -4..4' },
		{ id: 'aud', kind: 'scope' as const, cv: false, value: 0, lo: -1, hi: 1, note: 'SCOPE / audio, fixed -1..1' },
		{ id: 'm-hz', kind: 'meter' as const, cv: true, value: 3000, lo: 0, hi: 5000, note: 'LOUD / CV 3000 in 0..5000' },
		{ id: 'm-neg', kind: 'meter' as const, cv: true, value: -2, lo: -4, hi: 4, note: 'LOUD / CV -2 in -4..4' },
		{ id: 'm-aud', kind: 'meter' as const, cv: false, value: 0, lo: -1, hi: 1, note: 'LOUD / audio, dBFS' }
	];

	onMount(() => {
		const ctx = new AudioContext();
		for (const c of cases) {
			const an = ctx.createAnalyser();
			an.fftSize = c.kind === 'meter' ? 2048 : 8192;
			an.smoothingTimeConstant = 0;
			if (c.cv) {
				const dc = ctx.createConstantSource();
				dc.offset.value = c.value;
				dc.connect(an);
				dc.start();
			} else {
				// A real waveform on the audio cards, so the trace has a shape.
				const o = ctx.createOscillator();
				o.frequency.value = 300;
				const g = ctx.createGain();
				g.gain.value = 0.8;
				o.connect(g);
				g.connect(an);
				o.start();
			}
			modularSynth.graphProbes.set(c.id, an);
		}
		ready = true;
		return () => void ctx.close();
	});
</script>

<main class="p-6 bg-black min-h-screen font-mono text-xs text-white">
	<h1 class="font-bold mb-4">PROBE DISPLAY AUDIT</h1>
	{#if ready}
		<div class="grid grid-cols-2 gap-6" style="max-width: 900px">
			{#each cases as c (c.id)}
				<div>
					<div class="mb-1 opacity-70">{c.note}</div>
					<div style="width: 320px">
						<ProbeDisplay
							kind={c.kind}
							nodeId={c.id}
							color="#98c379"
							cv={c.cv}
							params={{ cvLo: c.lo, cvHi: c.hi, scopeSpan: 20 }}
						/>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</main>
