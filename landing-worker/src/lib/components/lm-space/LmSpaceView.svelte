<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
	import LeaderboardView from '$lib/components/leaderboard/LeaderboardView.svelte';
	import {
		loadLeaderboard,
		leaderboardStatus,
		leaderboardError,
		LEADERBOARD_URL
	} from '$lib/stores/leaderboard';
	import { playSound } from '$lib/sound';
	import Onboarding from '$lib/components/chrome/Onboarding.svelte';
	import { guideSeen, markGuideSeen, afterSiteGuide } from '$lib/stores/chrome';
	import { LM_SPACE_TOUR } from './lm-space-tour';

	let guideOpen = $state(false);

	function closeGuide() {
		guideOpen = false;
		markGuideSeen('lm-space');
	}

	/**
	 * Two readings of the same data. The volume is the default because it is
	 * what this view is for -- seeing where a model sits among the rest -- but a
	 * table still does things three dimensions cannot: sort, scan a column, and
	 * read an exact figure. Neither replaces the other.
	 */
	/* Hoisted out of the markup: an array literal in the `each` is rebuilt on
	   every render, and Svelte compares the keys of the new list against the
	   old one -- which threw each_key_duplicate and aborted the update, so the
	   GUIDE panel never mounted. */
	const MODES = [
		{ k: 'space' as const, label: 'SPACE' },
		{ k: 'table' as const, label: 'TABLE' }
	];

	let mode = $state<'space' | 'table'>('space');

	/**
	 * The volume is flown with WASD and a mouse; on a touch screen it is a
	 * slab you can only prod at. Phones and tablets therefore land on the
	 * table, with a note saying why, and can still opt into SPACE. Decided
	 * in a pre-effect so it lands before the effect below would boot the
	 * scene for a mode we are about to leave.
	 */
	let mobile = $state(false);
	let mobileNoteOpen = $state(true);
	$effect.pre(() => {
		mobile = matchMedia('(hover: none) and (pointer: coarse)').matches;
		if (mobile) mode = 'table';
	});

	/**
	 * three.js and roughly 640KB of marks and sky are fetched only when the
	 * volume is first opened, so none of it reaches the main bundle. The scene
	 * is torn down when the tab unmounts: a live WebGL context and a running
	 * animation frame outlive their DOM otherwise.
	 */
	let host = $state<HTMLDivElement>();
	let dispose: (() => void) | null = null;
	let engineError = $state<string | null>(null);
	let booting = $state(true);
	let started = false;

	async function start() {
		if (started || !host) return;
		started = true;
		try {
			const payload = await loadLeaderboard();
			if (!payload) return;
			const { mountLmSpace } = await import('./scene');
			if (!host) return;
			dispose = await mountLmSpace(host, payload);
		} catch (e) {
			engineError = e instanceof Error ? e.message : 'failed to start';
		} finally {
			booting = false;
			// Offered only after the volume is drawn: three of the steps point at
			// the stage, and pointing at one that has not rendered yet spotlights
			// an empty box. Not offered at all if the engine failed, since the
			// error is the thing to read then, and never on top of the site tour.
			if (!engineError && !guideSeen('lm-space')) {
				void afterSiteGuide().then(() => { guideOpen = true; });
			}
		}
	}

	$effect(() => {
		if (mode === 'space' && host && !started) void start();
	});

	onMount(() => () => {
		dispose?.();
		dispose = null;
	});
</script>

<div class="flex-1 min-h-0 flex flex-col">
	<div class="flex items-center gap-1.5 pb-1.5 shrink-0" data-tour="lms-modes">
		<span class="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest mr-0.5">VIEW AS</span>
		{#each MODES as { k, label } (k)}
			<button
				onclick={() => { mode = k; playSound('click'); }}
				class="press px-2 py-1 border rounded-xs text-xs font-bold cursor-pointer transition-colors {mode === k
					? 'border-[#56b6c2] text-[#56b6c2] bg-[#56b6c2]/10'
					: 'border-white/20 text-white/55 hover:border-white/50'}"
			>
				{label}
			</button>
		{/each}
		<button
			onclick={() => { guideOpen = true; playSound('click'); }}
			title="What this view is showing"
			class="press ml-auto px-2 py-1 border border-white/20 text-white/55 rounded-xs text-xs font-bold
				cursor-pointer transition-colors hover:border-[#56b6c2] hover:text-[#56b6c2]"
		>
			? GUIDE
		</button>
	</div>

	{#if guideOpen}
		<Onboarding steps={LM_SPACE_TOUR} heading="LM.SPACE TOUR" onClose={closeGuide} />
	{/if}

	{#if mobile && mobileNoteOpen}
		<div class="shrink-0 mb-1.5 px-2.5 py-2 border border-[#e5c07b]/50 bg-[#e5c07b]/10 rounded-xs text-xs font-mono text-[#e5c07b] flex items-start gap-2" transition:fade={{ duration: 160 }}>
			<span class="flex-1">
				<b>DESKTOP RECOMMENDED.</b> The 3D volume is flown with a keyboard and mouse and does not
				work well on a touch screen. You have been put on the TABLE view; SPACE is still there
				above if you want to try it anyway.
			</span>
			<button
				onclick={() => { mobileNoteOpen = false; playSound('click'); }}
				title="Dismiss"
				aria-label="Dismiss"
				class="press shrink-0 px-1 text-[#e5c07b]/70 hover:text-[#e5c07b] cursor-pointer transition-colors"
			>&#10005;</button>
		</div>
	{/if}

	{#if mode === 'table'}
		<LeaderboardView />
	{/if}
	<!-- The stage is hidden rather than destroyed when the table is showing.
	     Tearing it down drops the WebGL context and the loaded marks, so coming
	     back would re-boot the scene from nothing and lose the camera. -->
	<div class="lmspace relative flex-1 min-h-0 overflow-hidden border border-white/10 rounded-xs"
		class:lms-off={mode !== 'space'}
		data-tour="lms-stage" bind:this={host}>
			<div id="app" class="absolute inset-0"></div>
			<div id="labels" class="absolute inset-0 z-10 pointer-events-none overflow-hidden"></div>

			<div class="hud" id="topbar">
			  <div>
			    <div class="title">LM.SPACE</div>
			    <div class="sub">
			      <span id="meta">loading&hellip;</span><br>
			      <span class="hint-tip" title="Artificial Analysis language-models API. Every coordinate is a field of the payload; nothing is inferred.">source &#9432;</span>
			    </div>
			  </div>
			  <div id="ctl" data-tour="lms-ctl">
			    <div class="grp" style="--g:#56b6c2">
			      <span class="ghd">VIEW</span>
			      <div class="gbtns">
			        <!-- RACE only ever replays the timeline with the release-date axis
			             animated, so it is a third position on this same axis rather than
			             a whole separate TIMELAPSE group next to it. -->
			        <span class="cyc" id="view-cyc">
			          <button class="carrow" id="view-prev" title="Previous view">&#9664;</button>
			          <button class="cval" id="view-val" title="SPACE — every model at a position. TIMELINE — released along X. RACE — TIMELINE, replayed."></button>
			          <button class="carrow" id="view-next" title="Next view">&#9654;</button>
			        </span>
			      </div>
			    </div>
			    <div class="grp" style="--g:#61afef">
			      <span class="ghd">PROJECTION</span>
			      <div class="gbtns">
			        <!-- Two states, cycled rather than picked: the same ◄ value ► shape
			             as the synth's METER stepper, so a binary choice looks like every
			             other stepped choice on this HUD instead of a pair of toggle buttons. -->
			        <span class="cyc" id="proj-cyc">
			          <button class="carrow" id="proj-prev" title="Previous projection">&#9664;</button>
			          <button class="cval" id="proj-val" title="Perspective — natural depth, free flight / Orthographic — no foreshortening, reads as a flat plot"></button>
			          <button class="carrow" id="proj-next" title="Next projection">&#9654;</button>
			        </span>
			        <button class="btn" id="vp-cycle" title="Look straight down one axis — click to cycle the pair">$ &times; I</button>
			      </div>
			    </div>
			    <div class="grp" style="--g:#d19a66">
			      <span class="ghd">GRAVITY</span>
			      <div class="gbtns">
			      <button class="btn" id="g-start" title="N-body clustering in capability space">SIMULATE</button>
			      <button class="btn on" id="g-hull" title="How each cluster is drawn">LINK</button>
			      </div>
			    </div>
			    <div class="grp" style="--g:#98c379">
			      <span class="ghd">PARETO</span>
			      <div class="gbtns">
			      <button class="btn" id="pareto-toggle" title="No model beats every one on this surface at once — cheaper, smarter and faster all at the same time">FRONTIER</button>
			      </div>
			    </div>
			  </div>
			</div>

			<div id="modes" data-tour="lms-axes">
			  <div class="panel">
			    <!-- Only a toggle below the mobile breakpoint: on desktop the two
			         side panels have room to coexist, but a phone-width stage is
			         barely taller than one of them, so both start collapsed there
			         and a tap on the heading is what opens either one. -->
			    <button type="button" id="modeshd" class="phd">
			      <span class="lbl">axes</span><span class="pcaret">&#9662;</span>
			    </button>
			    <div id="axinfo" style="font-size:14px;line-height:1.75;color:rgba(255,255,255,.55)"></div>
			  </div>
			</div>

			<div class="panel" id="legend"></div>

			<div id="hint">
			  <span title="W A S D fly · Q E up/down · Shift boost · drag left to pan · right-drag or click the canvas to look · click a node to inspect · click empty space or press X to deselect · in look mode aim with the crosshair · Esc releases the cursor · R resets the view · L logos · C variant links · F freeze gravity">
			    <kbd>WASD</kbd> fly &middot; <kbd>R</kbd> reset &middot; controls &#9432;
			  </span>
			</div>

			<div id="fps" title="Frames per second, triangles drawn, and how many bodies are at each level of detail"></div>
			<div id="crosshair"></div>
			<div id="range"></div>
			<div id="outwarn">OUTSIDE &middot; <kbd>R</kbd> to return</div>
			<div id="mission"></div>
			<!-- Built once, outside #race's own innerHTML: that panel is rebuilt
			     wholesale four times a second while playing, and re-wiring click
			     handlers on every rebuild is wasted work a static sibling avoids. -->
			<div id="racectl">
				<button type="button" id="race-restart" title="Back to the start">&#9198;</button>
				<button type="button" id="race-back" title="Step back one increment">&#9664;&#9664;</button>
				<button type="button" id="race-play" title="Play / pause">&#9654;</button>
				<button type="button" id="race-fwd" title="Step forward one increment">&#9654;&#9654;</button>
			</div>
			<div id="race"></div>
			<div id="gravity"></div>
			<div id="card"></div>

			{#if booting}
				<div class="absolute inset-0 flex items-center justify-center text-xs font-mono text-[#56b6c2] pointer-events-none" out:fade={{ duration: 150 }}>
					<span class="blink-live">building the volume&hellip;</span>
				</div>
			{/if}

			{#if $leaderboardStatus === 'error' || engineError}
				<div class="absolute inset-0 flex items-center justify-center p-4" transition:fade={{ duration: 160 }}>
					<div
						class="border border-[#e06c75]/50 bg-black/80 rounded-xs px-4 py-3 text-xs font-mono text-[#e06c75] max-w-[420px]"
						transition:scale={{ duration: 180, start: 0.96, opacity: 0, easing: cubicOut }}
					>
						{engineError ?? $leaderboardError}
						<button onclick={() => { started = false; engineError = null; booting = true; void start(); }}
							class="press ml-2 underline cursor-pointer hover:text-white transition-colors">retry</button>
						<div class="text-white/35 mt-1">
							source: <a href={LEADERBOARD_URL} target="_blank" rel="noopener noreferrer"
								class="text-[#61afef] hover:underline">blog.krsz.in</a>
						</div>
					</div>
				</div>
			{/if}
	</div>
</div>

<style>
/* The scene builds its labels, tip bubbles and panel contents at runtime, so
   Svelte cannot scope these statically. Every selector is marked global and
   prefixed with .lmspace, which keeps it off the rest of the app. */
:global(.lmspace) {
    --cyan:#56b6c2; --green:#98c379; --purple:#c678dd; --yellow:#e5c07b;
    --blue:#61afef; --red:#e06c75; --orange:#d19a66; --fg:#d8dee9; --bg:#0a0b0d;
  }
:global(.lmspace) *, :global(.lmspace) *::before, :global(.lmspace) *::after { box-sizing:border-box; }
:global(.lmspace), :global(.lmspace) { background:var(--bg); color:var(--fg);
    /* Same face as the rest of the site; this view had its own stack and so
       stayed in the outline mono after the switch. 12px because every panel
       here is dense readout over a 3D scene. */
    font-family:'Jelly Pixel',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    font-size:12px; line-height:24px; overflow:hidden; }
:global(.lmspace #app) { position:absolute; inset:0; }
:global(.lmspace canvas) { display:block; }
:global(.lmspace .hud) { position:absolute; pointer-events:none; z-index:20; }
:global(.lmspace .hud > *) { pointer-events:auto; }
:global(.lmspace #topbar) { top:0; left:0; right:0; padding:9px 10px;
    display:flex; gap:12px; align-items:flex-start; justify-content:space-between;
    background:linear-gradient(180deg,rgba(10,11,13,.92),rgba(10,11,13,0)); }
/* The controls keep their full width and the heading gives way: a truncated
   title is readable, a clipped button is not. */
:global(.lmspace #topbar > div:first-child) { min-width:0; overflow:hidden; }
:global(.lmspace #ctl) { flex:none; }
:global(.lmspace .title) { font-weight:900; font-size:11px; letter-spacing:.12em; color:var(--cyan); }
:global(.lmspace .sub) { font-size:11px; color:rgba(255,255,255,.38); line-height:1.6; margin-top:3px; }
:global(.lmspace .sub a) { color:var(--blue); }
:global(.lmspace #ctl) { display:grid; grid-template-columns:auto auto; gap:4px 9px;
    max-height:calc(100% - 16px); overflow-y:auto; overflow-x:hidden;
    justify-content:end; align-items:center; }
:global(.lmspace .grp) { display:contents; }
:global(.lmspace .ghd) { font-size:9px; font-weight:900; letter-spacing:.12em; color:var(--g);
    white-space:nowrap; text-align:right; }
:global(.lmspace .gbtns) { display:flex; align-items:center; gap:5px; justify-content:flex-end; }
:global(.lmspace .gnum) { font-size:9px; color:var(--g); min-width:3ch; text-align:center; }
:global(.lmspace .btn) { padding:4px 9px; border:1px solid rgba(255,255,255,.18); border-radius:2px;
    background:rgba(0,0,0,.45); color:rgba(255,255,255,.65); font:inherit; font-size:10px;
    font-weight:700; cursor:pointer; letter-spacing:.03em; transition:.12s;
    white-space:nowrap; }
:global(.lmspace .btn:hover) { border-color:var(--g,rgba(255,255,255,.5)); color:#fff; }
:global(.lmspace .btn.on) { color:#0a0b0d; background:var(--g,#fff); border-color:var(--g,#fff); }
:global(.lmspace .btn.inert) { opacity:.28; cursor:default; pointer-events:none; }
:global(.lmspace #vp-cycle) { min-width:8ch; text-align:center; }
/* The synth's own METER stepper shape: a plain arrow either side of a
   bordered, filled value -- a binary or short cycle reads as one stepped
   control here instead of a row of toggle buttons for each option. */
:global(.lmspace .cyc) { display:flex; align-items:center; gap:1px; }
:global(.lmspace .carrow) { padding:0 2px; background:none; border:none; font:inherit;
    font-size:9px; color:var(--g); cursor:pointer; font-weight:700; }
:global(.lmspace .carrow:hover) { color:#fff; }
:global(.lmspace .cval) { padding:4px 9px; border:1px solid color-mix(in srgb, var(--g) 50%, transparent);
    background:color-mix(in srgb, var(--g) 12%, transparent); border-radius:2px;
    color:var(--g); font:inherit; font-size:10px; font-weight:900; letter-spacing:.03em;
    cursor:pointer; min-width:7ch; text-align:center; transition:.12s; }
:global(.lmspace .cval:hover) { background:color-mix(in srgb, var(--g) 20%, transparent); color:#fff; }
:global(.lmspace .row) { display:flex; gap:5px; flex-wrap:wrap; align-items:center; }
:global(.lmspace .lbl) { font-size:12px; font-weight:700; letter-spacing:.1em;
    color:rgba(255,255,255,.32); text-transform:uppercase; }
:global(.lmspace #modes) { position:absolute; top:84px; left:12px; z-index:20; display:flex; flex-direction:column; gap:8px; }
:global(.lmspace .panel) { background:rgba(9,10,12,.85); border:1px solid rgba(255,255,255,.12);
    border-radius:2px; padding:9px 11px; backdrop-filter:blur(8px); width:220px; }
:global(.lmspace #legend) { position:absolute; left:12px; bottom:26px; z-index:20;
    max-height:min(58%,420px); overflow-y:auto; width:220px; }
/* The heading is a button everywhere, and collapsing works at every width --
   the same _/expand shape LIFE.LAB's floating log uses, so either panel can
   be tucked out of the way on a desktop-sized stage too, not only forced
   closed on a phone-sized one. */
:global(.lmspace .phd) { display:flex; align-items:center; justify-content:space-between;
	width:100%; background:none; border:none; padding:0 0 5px; margin:0;
	font:inherit; color:inherit; cursor:pointer; }
:global(.lmspace .pcaret) { display:inline; transition:transform .15s; }
:global(.lmspace .collapsed .pcaret) { transform:rotate(-90deg); }
:global(.lmspace #modes.collapsed #axinfo),
:global(.lmspace #legend.collapsed #filtercount),
:global(.lmspace #legend.collapsed #franges),
:global(.lmspace #legend.collapsed #freset),
:global(.lmspace #legend.collapsed #fcreators) { display:none; }
@media (max-width: 520px) {
	/* Below phone width the two side panels cannot coexist without one
	   covering the other, so opening one auto-collapses the other (enforced
	   in scene.js) instead of both being free to stay open together. */
	:global(.lmspace #modes), :global(.lmspace #legend) { width:min(78vw,260px); }
	:global(.lmspace #legend) { bottom:12px; max-height:min(70%,460px); }
	:global(.lmspace #ctl) { grid-template-columns:1fr; justify-content:start; max-width:52vw; }
	:global(.lmspace .gbtns) { justify-content:flex-start; }
	:global(.lmspace .ghd) { text-align:left; }
	:global(.lmspace #hint) { display:none; }
}
/* Creator rows: card membership plus mute/solo, in the same shape as the
   synth's own TRK chips -- a name, then a divider, then two small letter
   buttons that light up filled rather than just changing text colour. */
:global(.lmspace .lg) { display:flex; align-items:center; gap:6px; font-size:11px;
    color:rgba(255,255,255,.55); padding:2px 0; }
:global(.lmspace .lg.mute) { opacity:.4; }
:global(.lmspace .dot) { display:none; }
:global(.lmspace .lgname) { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
:global(.lmspace .lgn) { opacity:.45; }
:global(.lmspace .lgm), :global(.lmspace .lgs) { font: inherit; font-size:10px; font-weight:700;
    width:15px; height:15px; line-height:15px; text-align:center; padding:0; margin-left:2px;
    border:1px solid rgba(255,255,255,.18); border-radius:2px; background:rgba(0,0,0,.4);
    color:rgba(255,255,255,.4); cursor:pointer; flex:none; }
:global(.lmspace .lgm:hover), :global(.lmspace .lgs:hover) { color:#fff; border-color:rgba(255,255,255,.5); }
:global(.lmspace .lgm.on) { background:#e06c75; border-color:#e06c75; color:#0a0b0d; font-weight:900; }
:global(.lmspace .lgs.on) { background:#e5c07b; border-color:#e5c07b; color:#0a0b0d; font-weight:900; }
:global(.lmspace .fcount) { font-size:11px; color:rgba(255,255,255,.4); margin-bottom:7px; }
:global(.lmspace #franges) { display:flex; flex-direction:column; gap:11px; margin-bottom:8px; }
:global(.lmspace .flbl) { display:flex; justify-content:space-between; font-size:11px;
    color:rgba(255,255,255,.55); margin-bottom:4px; }
:global(.lmspace .flbl .fval) { color:rgba(255,255,255,.4); font-variant-numeric:tabular-nums; }
/* The same visual language as the synth's HorizontalHardwareFader: a thin
   dark track, a coloured fill between the handles, and small bordered square
   handles with a centre grip mark -- built from plain divs rather than a
   native input so two handles can share one track. */
:global(.lmspace .fslider) { position:relative; height:14px; cursor:ew-resize; touch-action:none; }
:global(.lmspace .ftrack) { position:absolute; left:0; right:0; top:6px; height:2px;
    background:rgba(255,255,255,.15); border-radius:1px; }
:global(.lmspace .ffill) { position:absolute; top:5px; height:4px; border-radius:1px; opacity:.55; }
:global(.lmspace .fhandle) { position:absolute; top:2px; width:10px; height:10px; margin-left:-5px;
    border-radius:2px; border:1px solid rgba(0,0,0,.4); box-shadow:0 0 4px rgba(0,0,0,.6);
    display:flex; align-items:center; justify-content:center; cursor:ew-resize; }
:global(.lmspace .fhandle:hover), :global(.lmspace .fhandle:active) { filter:brightness(1.2); }
:global(.lmspace .fgrip) { width:1px; height:6px; background:rgba(0,0,0,.7); border-radius:1px; }
:global(.lmspace #hint) { position:absolute; right:12px; bottom:26px; z-index:19; text-align:right;
    font-size:11px; color:rgba(255,255,255,.3); line-height:1.7; }
:global(.lmspace kbd) { border:1px solid rgba(255,255,255,.22); border-radius:2px; padding:0 4px;
    font:inherit; font-size:12px; color:rgba(255,255,255,.55); }
:global(.lmspace .ntag) { position:absolute; white-space:nowrap; pointer-events:none; }
:global(.lmspace .ntag .nt-row) { display:flex; align-items:center;
    position:absolute; left:0; top:50%; transform:translate(9px, -50%); }
:global(.lmspace .ntag .nt-line) { display:block; width:15px; height:1px;
    background:linear-gradient(90deg,rgba(255,255,255,.15),rgba(255,255,255,.5)); flex:0 0 auto; }
:global(.lmspace .ntag .nt-txt) { font-size:inherit; letter-spacing:.02em; padding-left:4px;
    text-shadow:0 0 5px #000, 0 0 2px #000, 0 1px 2px #000; }
:global(.lmspace .spinenum) { font-size:12px; font-weight:700; letter-spacing:.04em;
    background:rgba(10,12,15,.72); padding:0 4px; border-radius:2px;
    border:1px solid rgba(86,182,194,.35); }
/* The spiral's month ticks: dense enough, against a cloud of hundreds of
   spheres, that a faint single letter was unreadable -- but a solid filled
   chip at every one of them, a dozen or more on screen at once, read as its
   own wall of boxes instead. Bold gold text with just a shadow to hold it off
   the background is the middle point: legible without becoming the loudest
   thing in the scene. */
:global(.lmspace .tmonth) { font-size:14px; font-weight:800; letter-spacing:.03em;
    color:#e5c07b; text-shadow:0 0 6px #000, 0 0 3px #000, 0 1px 3px #000;
    white-space:nowrap; }
:global(.lmspace .tag) { font-size:11px; color:rgba(255,255,255,.75); white-space:nowrap;
    text-shadow:0 0 6px #000,0 0 3px #000; pointer-events:none;
    padding-left:9px; letter-spacing:.02em; }
:global(.lmspace #card) { position:absolute; z-index:60; width:min(430px,92vw);
    background:rgba(15,17,20,.97); border:1px solid var(--cyan);
    border-radius:2px; box-shadow:0 14px 40px rgba(0,0,0,.85); display:none; }
:global(.lmspace #card .hd) { display:flex; justify-content:space-between; gap:8px; align-items:flex-start;
    padding:7px 9px; border-bottom:1px solid rgba(255,255,255,.1); }
:global(.lmspace #card .nm) { font-size:11px; font-weight:900; color:var(--cyan); line-height:1.35; }
:global(.lmspace #card .cr) { font-size:11px; color:rgba(255,255,255,.4); margin-top:2px; }
:global(.lmspace #card .qwarn) { font-size:12px; color:var(--orange); margin-top:3px; line-height:1.4;
    border-left:2px solid var(--orange); padding-left:5px; }
:global(.lmspace #card .bd) { padding:9px; }
:global(.lmspace .grid) { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; }
:global(.lmspace .kv) { border:1px solid rgba(255,255,255,.1); background:rgba(0,0,0,.4);
    border-radius:2px; padding:4px 6px; }
:global(.lmspace .kv .k) { font-size:12px; color:rgba(255,255,255,.36); text-transform:uppercase; letter-spacing:.06em; }
:global(.lmspace .kv .v) { font-size:11px; font-weight:700; margin-top:2px; }
:global(.lmspace .ranks) { margin-top:8px; padding-top:7px; border-top:1px solid rgba(255,255,255,.1);
    font-size:11px; color:rgba(255,255,255,.45); display:flex; flex-wrap:wrap; gap:4px 12px; }
:global(.lmspace .x) { cursor:pointer; color:rgba(255,255,255,.4); font-size:11px; background:none;
    border:none; font:inherit; padding:0; }
:global(.lmspace .x:hover) { color:#fff; }
:global(.lmspace #mission) { position:absolute; top:52px; left:50%; transform:translateX(-50%); z-index:30;
    display:none; text-align:center; background:rgba(9,10,12,.9);
    border:1px solid var(--yellow); border-radius:2px; padding:7px 14px;
    box-shadow:0 6px 24px rgba(0,0,0,.7); max-width:min(560px,92vw); }
:global(.lmspace #mission .q) { font-size:11px; font-weight:700; color:var(--yellow); }
:global(.lmspace #mission .m) { font-size:11px; color:rgba(255,255,255,.5); margin-top:3px; }
:global(.lmspace #mission .res) { font-size:12px; margin-top:5px; font-weight:700; }
:global(.lmspace #fps) { position:absolute; right:10px; bottom:9px; z-index:26;
    font-size:10px; letter-spacing:.04em; white-space:nowrap; pointer-events:none;
    text-shadow:0 0 5px #000; font-variant-numeric:tabular-nums; }
:global(.lmspace .fps-n) { font-weight:700; }
:global(.lmspace .fps-l) { color:rgba(255,255,255,.35); }
:global(.lmspace #crosshair) { position:absolute; left:50%; top:50%; z-index:25; width:16px; height:16px;
    margin:-8px 0 0 -8px; pointer-events:none; display:none; }
:global(.lmspace #crosshair:before), :global(.lmspace #crosshair:after) { content:''; position:absolute;
    background:rgba(255,255,255,.5); transition:background .1s; }
:global(.lmspace #crosshair.hot:before), :global(.lmspace #crosshair.hot:after) { background:var(--green); }
:global(.lmspace #crosshair.hot) { transform:scale(1.35); }
:global(.lmspace #crosshair:before) { left:7px; top:0; width:2px; height:16px; }
:global(.lmspace #crosshair:after) { top:7px; left:0; height:2px; width:16px; }
:global(.lmspace .lgico) { width:13px; height:13px; flex:0 0 auto;
    -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat; background-color:currentColor; }
:global(.lmspace #card .logo) { width:30px; height:30px; flex:0 0 auto;
    -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat; background-color:currentColor; }
:global(.lmspace #racectl) { position:absolute; top:56px; left:12px; z-index:30; display:none;
    width:200px; gap:4px; background:rgba(9,10,12,.92); border:1px solid var(--purple);
    border-radius:2px; padding:5px 6px; backdrop-filter:blur(8px); }
:global(.lmspace #racectl.show) { display:flex; }
:global(.lmspace #racectl button) { flex:1; padding:4px 0; border:1px solid rgba(255,255,255,.18);
    border-radius:2px; background:rgba(0,0,0,.45); color:rgba(255,255,255,.7); font:inherit;
    font-size:12px; cursor:pointer; transition:.12s; }
:global(.lmspace #racectl button:hover) { border-color:var(--purple); color:#fff; }
:global(.lmspace #racectl button.on) { color:#0a0b0d; background:var(--purple); border-color:var(--purple); }
:global(.lmspace #race) { position:absolute; top:98px; left:12px; z-index:30; display:none;
    width:200px; max-height:calc(100% - 122px); overflow-y:auto; background:rgba(9,10,12,.92); border:1px solid var(--purple);
    border-radius:2px; padding:7px 8px; backdrop-filter:blur(8px); }
:global(.lmspace #race .rhd) { display:flex; justify-content:space-between; align-items:baseline;
    gap:6px; padding-bottom:5px; margin-bottom:4px; border-bottom:1px solid rgba(255,255,255,.12); }
:global(.lmspace #race .q) { font-size:12px; font-weight:900; color:var(--purple); letter-spacing:.04em; }
:global(.lmspace #race .m) { font-size:12px; color:rgba(255,255,255,.4); }
:global(.lmspace .rrow) { display:flex; align-items:center; gap:6px; font-size:11px; padding:1.5px 0;
    color:rgba(255,255,255,.62); }
:global(.lmspace .rrow.me) { background:rgba(198,120,221,.16); outline:1px solid rgba(198,120,221,.4);
    border-radius:2px; color:#fff; }
:global(.lmspace .rrow .rk) { min-width:3.2ch; text-align:right; color:rgba(255,255,255,.3);
    flex:0 0 auto; font-variant-numeric:tabular-nums; padding-right:2px; }
:global(.lmspace .rrow .rn) { flex:1 1 0; min-width:0; overflow:hidden; text-overflow:ellipsis;
    white-space:nowrap; }
:global(.lmspace .rrow .rv) { font-weight:700; flex:0 0 auto; font-variant-numeric:tabular-nums; }
:global(.lmspace .rhint) { font-size:12px; color:rgba(255,255,255,.35); margin-top:5px;
    padding-top:4px; border-top:1px solid rgba(255,255,255,.1); }
:global(.lmspace #gravity) { position:absolute; top:84px; left:12px; z-index:30; display:none;
    width:200px; max-height:calc(100% - 108px); overflow-y:auto; background:rgba(9,10,12,.92); border:1px solid var(--green);
    border-radius:2px; padding:7px 8px; backdrop-filter:blur(8px); }
:global(.lmspace #gravity .q) { color:var(--green); }
:global(.lmspace .gcl) { border-top:1px solid rgba(255,255,255,.08); padding:4px 0 3px; }
:global(.lmspace .gcl:first-of-type) { border-top:0; }
:global(.lmspace .gcl-h) { font-size:11px; color:rgba(255,255,255,.72); }
:global(.lmspace .gcl-m) { font-size:12px; color:rgba(255,255,255,.42); margin-top:1px; }
:global(.lmspace #range) { position:absolute; left:50%; top:calc(50% + 22px); transform:translateX(-50%);
    z-index:24; font-size:11px; letter-spacing:.06em; white-space:nowrap;
    color:rgba(255,255,255,.4); pointer-events:none; text-shadow:0 0 5px #000;
    opacity:0; transition:opacity .25s; }
:global(.lmspace #range .rg-lab) { color:rgba(255,255,255,.3); }
:global(.lmspace #range .rg-num) { color:var(--cyan); font-weight:700; }
:global(.lmspace #range.mid .rg-num) { color:var(--yellow); }
:global(.lmspace #range.far .rg-num) { color:var(--red); }
:global(.lmspace #range .rg-warn) { color:var(--red); }
:global(.lmspace #outwarn) { position:absolute; left:50%; top:calc(50% - 30px); transform:translate(-50%,4px);
    z-index:24; font-size:9px; letter-spacing:.06em; white-space:nowrap;
    color:var(--red); text-shadow:0 0 5px #000; pointer-events:none;
    opacity:0; transition:opacity .25s ease, transform .25s ease; }
:global(.lmspace #outwarn.show) { opacity:1; transform:translate(-50%,0); }
:global(.lmspace #outwarn kbd) { border:none; padding:0; font-size:9px; color:var(--red); font-weight:700; }
/* Hiding keeps the WebGL context and the loaded marks alive; the scene
   re-fits itself when the stage is laid out again. */
:global(.lmspace.lms-off) { display:none; }
:global(.lmspace #tip) { position:absolute; z-index:80; max-width:290px; padding:8px 11px;
    background:rgba(15,17,20,.97); border:1px solid rgba(255,255,255,.2);
    border-radius:2px; font-size:9px; line-height:1.55; color:var(--fg);
    box-shadow:0 10px 30px rgba(0,0,0,.7); pointer-events:none;
    opacity:0; transform:translateY(-3px); transition:opacity .14s, transform .14s; }
:global(.lmspace #tip.show) { opacity:1; transform:none; }
:global(.lmspace #tip::after) { content:''; position:absolute; left:var(--arrow,20px); width:8px; height:8px;
    background:rgba(15,17,20,.97); border:1px solid rgba(255,255,255,.2);
    transform:rotate(45deg); margin-left:-4px; }
:global(.lmspace #tip[data-side="below"]::after) { top:-5px; border-right:none; border-bottom:none; }
:global(.lmspace #tip[data-side="above"]::after) { bottom:-5px; border-left:none; border-top:none; }
:global(.lmspace .has-tip), :global(.lmspace .hint-tip) { cursor:help; }
/* Radius's ◄ value ► sits inside the AXES text panel rather than #ctl, so it
   needs the same .cyc font metrics restated at this smaller size. */
:global(.lmspace #rfield .cyc) { font-size:14px; }
:global(.lmspace #rfield .cval) { font-size:11px; }
:global(.lmspace #boot) { position:absolute; inset:0; z-index:99; background:var(--bg); display:flex;
    align-items:center; justify-content:center; font-size:11px; color:var(--cyan); }
:global(.lmspace .err) { color:var(--red); }
:global(.lmspace ::-webkit-scrollbar) { width:7px; height:7px; }
:global(.lmspace ::-webkit-scrollbar-thumb) { background:rgba(255,255,255,.16); border-radius:4px; }
</style>
