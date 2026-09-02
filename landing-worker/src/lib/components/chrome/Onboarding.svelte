<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { playSound } from '../../sound';
	import { resolvedTheme, THEME_STYLES } from '../../stores/theme';
	import { consoleOverlayOpen, hotkeyOverlayOpen } from '../../stores/chrome';

	let {
		onClose,
		steps,
		heading = 'GETTING STARTED'
	}: { onClose: () => void; steps?: Step[]; heading?: string } = $props();

	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);

	export interface Step {
		/** `data-tour` value of the element this step points at. */
		target: string;
		title: string;
		body: string;
		/** Keys worth showing next to the copy — the real bindings, nothing invented. */
		keys?: { key: string; desc: string }[];
		color: string;
		/** Optional button that demonstrates the step instead of describing it. */
		action?: { label: string; run: () => void };
	}

	const SITE_STEPS: Step[] = [
		{
			target: 'tabs',
			title: 'EIGHT VIEWS',
			body: 'Everything on this site lives in one of eight views. Click a tab, or hold Ctrl and press its number — that works everywhere, including inside the keyboard tester and the piano, so nothing can trap you.',
			keys: [
				{ key: 'Ctrl+0', desc: 'modules — the live projects, with real architecture diagrams' },
				{ key: 'Ctrl+1', desc: 'guestbook — posts to blog.krsz.in' },
				{ key: 'Ctrl+2', desc: 'synth — 8-track WebAudio workstation, .mid in, WAV out' },
				{ key: 'Ctrl+3', desc: 'utils — twelve hardware testers' },
				{ key: 'Ctrl+4', desc: 'lm-space — the model table as a navigable volume' },
				{ key: 'Ctrl+5', desc: 'krsz-vm — a real x86 PC, emulated in the tab' },
				{ key: 'Ctrl+6', desc: 'chatbot — a language model on your own GPU, no server' },
				{ key: 'Ctrl+7', desc: "lifelab — Conway's Game of Life, as a campaign" }
			],
			color: '#56b6c2'
		},
		{
			target: 'panel',
			title: 'THE WORKBENCH',
			body: 'The active view fills this panel. Nothing in it is decorative: every latency, level and capability you see was measured in your browser or read from the service it describes. Where a browser refuses to answer, it prints "n/a" instead of a plausible number.',
			color: '#e5c07b'
		},
		{
			target: 'console-btn',
			title: 'THE CONSOLE',
			body: 'A small shell, dropped down over whatever view you are on. Its filesystem is a live projection of this site’s own data, so it cannot drift out of date.',
			keys: [
				{ key: '` backquote', desc: 'open or close it from anywhere' },
				{ key: 'help', desc: 'the command list; man <cmd> explains one' },
				{ key: 'ls / cd / cat', desc: 'browse /projects, /operator, /synth, /edge' },
				{ key: 'cmd | cmd', desc: 'pipe into grep, head, tail, sort, uniq, wc' },
				{ key: 'trace', desc: 'the Cloudflare PoP actually serving you' }
			],
			color: '#98c379',
			action: { label: 'OPEN IT', run: () => consoleOverlayOpen.set(true) }
		},
		{
			target: 'launchpad',
			title: 'LAUNCHPAD',
			body: 'The same five views as pads, plus the theme switch. The sidebar above it is the operator profile; the banner at the top is just the name.',
			keys: [{ key: 'T', desc: 'cycle theme — tokyo, gruvbox, nord, amber' }],
			color: '#c678dd'
		},
		{
			target: 'edge',
			title: 'REAL EDGE, NOT A BADGE',
			body: 'This reads /cdn-cgi/trace on every load: the Cloudflare point of presence that actually served you, the negotiated protocol and the TLS version. Run "trace" in the console for the full record with a measured round trip.',
			color: '#61afef'
		},
		{
			target: 'guide-btn',
			title: 'THAT IS THE TOUR',
			body: 'This button reopens the walkthrough any time — so does the "guide" command.',
			color: '#e06c75'
		},
		{
			target: 'guide-btn',
			title: 'ONE MORE THING — THE KEYMAP',
			body: 'Every shortcut on this site, in one place: navigation, the synth’s QWERTY piano, the console, all of it. Press ? or F1 whenever you need it back.',
			keys: [
				{ key: '? / F1', desc: 'full keyboard reference' },
				{ key: 'Esc', desc: 'close whichever overlay is open' }
			],
			color: '#e06c75',
			action: { label: 'SHOW KEYMAP', run: () => hotkeyOverlayOpen.set(true) }
		}
	];

	interface Box {
		x: number;
		y: number;
		w: number;
		h: number;
	}

	let index = $state(0);
	let box = $state<Box | null>(null);
	/** Which side of the target the bubble sits on. */
	let placement = $state<'top' | 'bottom'>('bottom');
	let bubbleStyle = $state('');
	let bubbleEl: HTMLDivElement | undefined = $state();

	let STEPS = $derived(steps ?? SITE_STEPS);
	let step = $derived(STEPS[index]);
	let isLast = $derived(index === STEPS.length - 1);

	const PAD = 6;
	const GAP = 14;

	function targetEl(name: string): HTMLElement | null {
		const el = document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
		if (!el) return null;
		const r = el.getBoundingClientRect();
		// A zero-sized or fully hidden anchor cannot be pointed at.
		return r.width > 0 && r.height > 0 ? el : null;
	}

	/** Measure the current target and park the bubble beside it, inside the viewport. */
	async function place() {
		const el = targetEl(step.target);
		if (!el) {
			box = null;
			bubbleStyle = 'left: 50%; top: 50%; transform: translate(-50%, -50%);';
			return;
		}
		el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
		const r = el.getBoundingClientRect();
		box = { x: r.left, y: r.top, w: r.width, h: r.height };

		await tick();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const bw = Math.min(bubbleEl?.offsetWidth || 360, vw - 16);
		const bh = bubbleEl?.offsetHeight || 220;

		// Prefer below; flip above when the target sits low on the screen.
		const below = r.bottom + GAP;
		placement = below + bh <= vh - 8 ? 'bottom' : 'top';
		const top = placement === 'bottom' ? below : Math.max(8, r.top - GAP - bh);

		// Centre on the target, then pull back inside the viewport.
		let left = r.left + r.width / 2 - bw / 2;
		left = Math.max(8, Math.min(left, vw - bw - 8));
		bubbleStyle = `left: ${Math.round(left)}px; top: ${Math.round(top)}px; width: ${Math.round(bw)}px;`;
	}

	/** Arrow x, relative to the bubble, so it still points at the target after clamping. */
	let arrowLeft = $derived.by(() => {
		if (!box || !bubbleStyle) return null;
		const bubbleX = parseFloat(bubbleStyle.match(/left: (-?[\d.]+)px/)?.[1] ?? '0');
		const bubbleW = parseFloat(bubbleStyle.match(/width: ([\d.]+)px/)?.[1] ?? '0');
		const centre = box.x + box.w / 2 - bubbleX;
		return Math.max(14, Math.min(centre, bubbleW - 14));
	});

	/** +1/-1 -- which way the bubble content should slide on the next step change. */
	let direction = $state(1);

	function next() {
		if (isLast) {
			onClose();
			return;
		}
		direction = 1;
		index++;
		playSound('click');
	}

	function back() {
		if (index === 0) return;
		direction = -1;
		index--;
		playSound('click');
	}

	function runAction() {
		const action = step.action;
		onClose();
		action?.run();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowRight' || e.key === 'Enter') {
			e.preventDefault();
			next();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			back();
		}
	}

	// Re-measure whenever the step changes, and keep up with layout changes.
	$effect(() => {
		index;
		$resolvedTheme;
		void place();
	});

	/**
	 * Every per-view tour is mounted deep inside the routed panel, which paints
	 * `backdrop-blur-sm` for the video background to show through. A filter (like
	 * a transform) creates a new containing block for its descendants' `position:
	 * fixed`, so without this the whole overlay -- click-catcher, spotlight and
	 * bubble alike -- would measure the viewport correctly but render offset by
	 * however far that block sits from the real origin. Moving the node to
	 * `<body>` keeps `fixed` meaning what it says regardless of what the panel
	 * around any given view does.
	 */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	onMount(() => {
		const onResize = () => void place();
		window.addEventListener('resize', onResize);
		window.addEventListener('scroll', onResize, true);
		window.addEventListener('keydown', onKeydown);
		return () => {
			window.removeEventListener('resize', onResize);
			window.removeEventListener('scroll', onResize, true);
			window.removeEventListener('keydown', onKeydown);
		};
	});
</script>

<div use:portal out:fade={{ duration: 180 }}>
	<!-- Click catcher: the tour drives itself, so nothing underneath is clickable -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[166]" onclick={(e) => e.stopPropagation()}></div>

	{#if box}
		<!-- Spotlight: a hole punched out of a huge shadow, so the anchor stays lit -->
		<div
			class="fixed z-[168] pointer-events-none rounded-sm transition-all duration-200 ease-out"
			style="left: {box.x - PAD}px; top: {box.y - PAD}px; width: {box.w + PAD * 2}px; height: {box.h + PAD * 2}px;
			       box-shadow: 0 0 0 9999px rgba(0,0,0,0.72); border: 2px solid {step.color};"
		></div>
	{:else}
		<div class="fixed inset-0 z-[168] bg-black/72 pointer-events-none"></div>
	{/if}

	<div
		bind:this={bubbleEl}
		class="fixed z-[170] max-w-[min(480px,94vw)] {themeStyles.cardBg} border rounded-sm shadow-[0_16px_48px_rgba(0,0,0,0.85)] font-mono transition-[border-color] duration-200"
		style="{bubbleStyle} border-color: {step.color}88;"
		in:fade={{ duration: 200 }}
	>
		{#if box && arrowLeft !== null}
			<div
				class="absolute w-3 h-3 rotate-45 {themeStyles.cardBg} transition-[border-color] duration-200"
				style="left: {arrowLeft - 6}px; {placement === 'bottom'
					? `top: -7px; border-left: 2px solid ${step.color}88; border-top: 2px solid ${step.color}88;`
					: `bottom: -7px; border-right: 2px solid ${step.color}88; border-bottom: 2px solid ${step.color}88;`}"
			></div>
		{/if}

		<!-- Keyed on the step index so the slide direction reflects Next/Back/dot-jump;
		     only the content re-mounts, never the bubble shell itself -- bubbleEl's
		     measurement in place() depends on that element staying alive across steps. -->
		{#key index}
			<div in:fly={{ x: direction * 24, duration: 180, opacity: 0 }}>
				<div class="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-white/10">
					<span class="text-sm font-black tracking-wide" style="color: {step.color}">{step.title}</span>
					<span class="text-xs text-white/45">{index + 1}/{STEPS.length}</span>
				</div>

			<div class="px-2.5 py-2 space-y-2">
				<p class="text-xs sm:text-sm text-white/75 leading-relaxed">{step.body}</p>

				{#if step.keys}
					<div class="space-y-1">
						{#each step.keys as k (k.key)}
							<div class="flex items-baseline gap-2">
								<kbd
									class="shrink-0 px-2 py-1 rounded-xs border bg-black/50 text-[11px] sm:text-xs font-bold whitespace-nowrap min-w-[100px] text-center"
									style="border-color: {step.color}55; color: {step.color}"
								>
									{k.key}
								</kbd>
								<span class="text-[11px] sm:text-xs text-white/70 leading-snug">{k.desc}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
		{/key}

		<div class="flex items-center justify-between gap-2 px-2.5 py-1.5 border-t border-white/10">
			<div class="flex items-center gap-1.5">
				<!-- Keyed by position: several steps may point at the same anchor, so a
				     target is not a unique key. -->
				{#each STEPS as s, i (i)}
					<button
						onclick={() => {
							direction = i > index ? 1 : -1;
							index = i;
						}}
						aria-label={`Step ${i + 1}: ${s.title}`}
						class="press w-1.5 h-1.5 rounded-full cursor-pointer transition-all {i === index ? 'scale-125' : 'bg-white/20 hover:bg-white/45'}"
						style={i === index ? `background-color: ${s.color}` : undefined}
					></button>
				{/each}
				<button onclick={onClose} class="press ml-1.5 text-xs text-white/45 hover:text-white cursor-pointer transition-colors">SKIP</button>
			</div>

			<div class="flex items-center gap-1.5">
				{#if step.action}
					<button
						onclick={runAction}
						class="press px-2.5 py-1 border rounded-xs text-[11px] font-bold cursor-pointer hover:bg-white/10 transition-colors"
						style="border-color: {step.color}88; color: {step.color}"
					>
						{step.action.label}
					</button>
				{/if}
				<button
					onclick={back}
					disabled={index === 0}
					class="press px-2.5 py-1 border border-white/25 text-white/70 rounded-xs text-[11px] font-bold cursor-pointer hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
				>
					BACK
				</button>
				<button
					onclick={next}
					class="press px-3 py-1 border rounded-xs text-[11px] font-black cursor-pointer hover:bg-white/10 transition-colors"
					style="border-color: {step.color}; color: {step.color}"
				>
					{isLast ? 'DONE' : 'NEXT →'}
				</button>
			</div>
		</div>
	</div>
</div>
