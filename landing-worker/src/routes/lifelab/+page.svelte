<script lang="ts">
	import { onMount } from 'svelte';
	import { suspendNavHotkeys } from '$lib/stores/hotkeys';

	/**
	 * LIFE.LAB, mounted into the site.
	 *
	 * The game is plain DOM: its module resolves every element by id when it is
	 * imported and then drives a canvas itself, so this page renders the markup
	 * it expects and imports it afterwards. Doing it the other way round leaves
	 * `$('#cv')` null and nothing starts.
	 *
	 * The import is dynamic and inside onMount for the same reason it is on the
	 * VM view: the module touches document and localStorage at load, which the
	 * server render has neither of.
	 */
	let mounted = $state(false);

	onMount(() => {
		let disposed = false;
		// The game owns the keyboard while it is up -- SPACE runs, R rotates --
		// so the site's own single-key shortcuts stand aside. Ctrl+0-7 still
		// works: the layout handles those before anything else sees them.
		suspendNavHotkeys.set(true);
		void (async () => {
			await import('$lib/components/lifelab/style.css');
			if (disposed) return;
			await import('$lib/components/lifelab/main.js');
			if (!disposed) mounted = true;
		})();
		return () => {
			disposed = true;
			suspendNavHotkeys.set(false);
		};
	});
</script>

<svelte:head>
	<title>KRSZ™ // 7:lifelab — Conway Automaton Laboratory</title>
	<meta
		name="description"
		content="Conway's Game of Life as a 25-level campaign: the two rules, still lifes and oscillators, gliders and spaceships, collisions, and the glider gun that makes computation possible."
	/>
</svelte:head>

<!-- The ids below are the game's own contract; main.js looks each of them up.
     The negative margins undo the slot's padding: every other view is a
     document that wants a margin, this one is an application that draws to its
     own edges. -->
<div id="lifelab" class="-m-2.5 sm:-m-3.5">
	<aside id="side">
		<div id="brand">LIFE<span>.LAB</span><small>CONWAY AUTOMATON · B3/S23</small></div>
		<button id="shopbtn" title="Spend credits on aids">
			<span class="sicon"></span><span class="slabel">SHOP</span><b id="coins">0</b>
		</button>
		<div id="lvhead" class="shead">
			<span>LEVELS</span>
			<button id="modebtn" title="Back to the mode chooser">MODE</button>
			<button id="wipebtn" title="Erase all saved progress and start over">WIPE</button>
		</div>
		<div id="levels"></div>
		<div class="shead"><span>LOG</span><small>what the dish just did</small></div>
		<div id="term"></div>
	</aside>
	<main id="stage">
		<div id="topbar"></div>
		<div id="stagerow">
			<div id="cvwrap">
				<canvas id="cv"></canvas>
				<div id="crt"></div>
				<div id="spotlight"></div>
				<div id="guide"><span id="gstep"></span><span id="gtext"></span></div>
				<div id="msg" class="hidden"></div>
			</div>
			<div id="tray"></div>
		</div>
	</main>
</div>

{#if !mounted}
	<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
		<span class="font-mono text-xs text-white/40">loading LIFE.LAB…</span>
	</div>
{/if}
