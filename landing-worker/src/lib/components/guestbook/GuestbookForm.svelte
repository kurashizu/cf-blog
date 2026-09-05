<script lang="ts">
	import BoxHeader from '../chrome/BoxHeader.svelte';
	import AsciiArt from '../chrome/AsciiArt.svelte';
	import { onMount, tick } from 'svelte';
	import { fade } from '$lib/perf-transitions';
	import { playSound } from '../../sound';
	import { resolvedTheme, THEME_STYLES } from '../../stores/theme';
	import { pulseStep } from '../../stores/clock';
	import { performanceMode } from '../../stores/performance';

	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);

	let gbName = $state('');
	let gbEmail = $state('');
	let gbContent = $state('');
	let gbStatus = $state<string | null>(null);
	let gbFocusedField = $state<'name' | 'email' | 'content' | null>(null);
	/** Bumped on a rejected submit so the form can play .shake-once again for a repeat mistake. */
	let gbShakeGen = $state(0);

	interface GuestbookMessage {
		id: string;
		name: string;
		content: string;
		timestamp: string;
		approved: boolean;
	}

	/** A message as the field actually carries it: a body with a position and a
	 *  velocity, in field pixels. Everything the physics touches lives here and
	 *  is mutated in place each frame -- `packets` is the render-time snapshot
	 *  taken from it, so the loop never reassigns reactive state per frame. */
	interface Packet extends GuestbookMessage {
		x: number;
		y: number;
		vx: number;
		vy: number;
		w: number;
		h: number;
		color: string;
	}

	const PACKET_COLORS = ['#e06c75', '#56b6c2', '#e5c07b', '#98c379', '#c678dd', '#61afef'];

	/** A fixed seed per id (not Math.random on every reactive pass) so a
	 *  reload drops the field in the same place rather than reshuffling. */
	function seededRandom(seed: string): () => number {
		let h = 0;
		for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
		return () => {
			h = (h * 1103515245 + 12345) >>> 0;
			return h / 4294967296;
		};
	}

	let messages = $state<GuestbookMessage[]>([]);
	let messagesState = $state<'loading' | 'ready' | 'error'>('loading');

	/* ---------- the field ----------------------------------------------------
	 * Packets are bodies in a box: they carry momentum, bounce off each other
	 * and off the walls, and can be thrown by dragging one. The whole thing is
	 * a single rAF loop over `bodies`, which is deliberately NOT reactive state
	 * -- mutating 30 reactive objects 60 times a second would put Svelte's
	 * scheduler on the hot path for no reason. The loop writes transforms
	 * straight to the DOM nodes instead, and Svelte only ever renders the list
	 * itself (which changes when messages load, not when they move). */
	let fieldEl = $state<HTMLDivElement | null>(null);
	/* $state.raw, not $state: the array is replaced wholesale when messages
	   load (which must re-render the list) but its objects are mutated sixty
	   times a second by the loop (which must not). A deep proxy would put the
	   scheduler on the hot path for every x/y write; raw tracks the
	   reassignment only, which is exactly the granularity wanted here. */
	let bodies = $state.raw<Packet[]>([]);
	/* Plain array on purpose: bind:this fills it and the loop reads it to write
	   transforms. Nothing renders from it, so reactivity would only cost. */
	// svelte-ignore non_reactive_update
	let nodes: (HTMLElement | null)[] = [];
	let selected = $state<string | null>(null);
	/** Which body the pointer is currently carrying, if any. */
	let dragId: string | null = null;

	const CARD_W = 150;
	const CARD_H = 54;
	/** An expanded card is a bigger obstacle; the physics reads these so its
	 *  neighbours are pushed clear of the text rather than overlapping it. */
	const OPEN_W = 240;
	const OPEN_H = 150;

	function buildBodies(msgs: GuestbookMessage[]) {
		const rect = fieldEl?.getBoundingClientRect();
		const W = rect?.width || 600;
		const H = rect?.height || 300;
		const next = msgs.map((m, i) => {
			const rand = seededRandom(m.id);
			return {
				...m,
				// Inset by half a card so nothing starts already clipped by a wall.
				x: CARD_W / 2 + rand() * Math.max(1, W - CARD_W),
				y: CARD_H / 2 + rand() * Math.max(1, H - CARD_H),
				// Slow enough to read while it moves; the drift is ambient, not busy.
				vx: (rand() - 0.5) * 26,
				vy: (rand() - 0.5) * 26,
				w: CARD_W,
				h: CARD_H,
				color: PACKET_COLORS[i % PACKET_COLORS.length]
			};
		});
		/* Sized from the local array, not from `bodies`. Reading `bodies` here
		   read state this function had just written, and inside the $effect below
		   that registers the effect as its own dependency -- it reran itself
		   until Svelte gave up with effect_update_depth_exceeded, which took the
		   whole page down with it (the boot screen simply never got to finish).
		   The assignment is last, so nothing in here observes it. */
		nodes = new Array(next.length).fill(null);
		bodies = next;
	}

	/* Registers a card's element in `nodes`, and places it immediately.
	 *
	 * An action rather than bind:this: `nodes` is deliberately not reactive --
	 * the loop reads it every frame and nothing renders from it -- and
	 * bind:this needs reactive state to write through, so binding into a plain
	 * array left every slot empty and the cards stacked at the origin with no
	 * transform at all. The action also runs at exactly the right moment: the
	 * element exists, so its position can be written on the spot instead of
	 * waiting for a frame that a hidden tab or performance mode may never
	 * deliver. */
	function register(node: HTMLElement, i: number) {
		nodes[i] = node;
		place(node, bodies[i]);
		return {
			update(next: number) { nodes[i] = null; nodes[next] = node; place(node, bodies[next]); },
			destroy() { nodes[i] = null; }
		};
	}

	/** One card's transform. Its x/y are the centre, so the offset is half its
	 *  current size -- read from the selection, since only the loop maintains
	 *  b.w/b.h and this also runs when the loop is off. */
	function place(node: HTMLElement, b: Packet | undefined) {
		if (!b) return;
		const { w, h } = sizeOf(b, b.id === selected);
		node.style.transform = `translate3d(${b.x - w / 2}px, ${b.y - h / 2}px, 0)`;
	}

	/** Write every body's position to its node. The loop does this per frame,
	 *  but it also has to happen once as soon as the nodes exist: until then
	 *  the cards carry no transform and sit stacked at the field's origin,
	 *  which is what they show under performance mode, in a background tab
	 *  whose rAF is throttled, and in the gap before the first frame. */
	function paint() {
		for (let i = 0; i < bodies.length; i++) {
			const n = nodes[i];
			if (n) place(n, bodies[i]);
		}
	}

	/* Rebuild whenever the message list changes, and once the field element
	   exists to measure. Reading both here is what re-runs it on either.
	   The paint is deferred to a microtask because bind:this only fills
	   `nodes` after this effect's own DOM update has been applied. */
	$effect(() => {
		messages;
		if (!fieldEl) return;
		buildBodies(messages);
	});

	/** Sizes follow selection: the open card is the one being read. */
	function sizeOf(p: Packet, open: boolean) {
		return open ? { w: OPEN_W, h: OPEN_H } : { w: CARD_W, h: CARD_H };
	}

	let raf = 0;
	let last = 0;

	function step(now: number) {
		raf = requestAnimationFrame(step);
		const rect = fieldEl?.getBoundingClientRect();
		if (!rect) return;
		const W = rect.width;
		const H = rect.height;
		// Seconds, clamped: a backgrounded tab resumes with a huge gap, and
		// integrating it in one go would fling every body through a wall.
		const dt = Math.min((now - last) / 1000 || 0, 0.05);
		last = now;

		for (const b of bodies) {
			const { w, h } = sizeOf(b, b.id === selected);
			b.w = w;
			b.h = h;
		}

		for (const b of bodies) {
			if (b.id === dragId) continue;         // carried, not simulated
			b.x += b.vx * dt;
			b.y += b.vy * dt;
			// Drag: a thrown packet coasts to a stop rather than pinballing forever.
			const k = Math.pow(0.55, dt);
			b.vx *= k;
			b.vy *= k;
			// Walls. Position is the card's centre, so the bound is half its size.
			const hw = b.w / 2;
			const hh = b.h / 2;
			if (b.x < hw) { b.x = hw; b.vx = Math.abs(b.vx) * 0.6; }
			if (b.x > W - hw) { b.x = W - hw; b.vx = -Math.abs(b.vx) * 0.6; }
			if (b.y < hh) { b.y = hh; b.vy = Math.abs(b.vy) * 0.6; }
			if (b.y > H - hh) { b.y = H - hh; b.vy = -Math.abs(b.vy) * 0.6; }
		}

		/* Separation, as axis-aligned boxes rather than circles: the cards are
		   wide rectangles, and a circle around one either leaves visible gaps or
		   overlaps at the corners. Resolved along the shallower axis, which is
		   the direction the pair actually needs to move to stop touching. */
		for (let i = 0; i < bodies.length; i++) {
			for (let j = i + 1; j < bodies.length; j++) {
				const a = bodies[i];
				const b = bodies[j];
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const ox = (a.w + b.w) / 2 - Math.abs(dx);   // overlap on x
				const oy = (a.h + b.h) / 2 - Math.abs(dy);   // overlap on y
				if (ox <= 0 || oy <= 0) continue;
				const aFixed = a.id === dragId;
				const bFixed = b.id === dragId;
				if (aFixed && bFixed) continue;
				// A dragged card pushes others without being pushed itself.
				const share = aFixed || bFixed ? 1 : 0.5;
				if (ox < oy) {
					const s = Math.sign(dx) || 1;
					if (!aFixed) { a.x -= s * ox * share; a.vx -= s * 22; }
					if (!bFixed) { b.x += s * ox * share; b.vx += s * 22; }
				} else {
					const s = Math.sign(dy) || 1;
					if (!aFixed) { a.y -= s * oy * share; a.vy -= s * 22; }
					if (!bFixed) { b.y += s * oy * share; b.vy += s * 22; }
				}
			}
		}

		// One write per body, straight to the node -- no reactive round-trip.
		paint();
	}

	/* Performance mode kills CSS animation site-wide but cannot reach a rAF
	   loop, the same gap perf-transitions.ts exists to cover -- so the loop is
	   gated on the store here. Off, the cards simply sit where they were
	   dropped and stay readable and clickable. */
	/* Opening a card changes its size, so its own transform (which is anchored
	   on the centre) has to be rewritten. The loop covers this while it runs;
	   this covers performance mode, where it does not. */
	$effect(() => {
		selected;
		if ($performanceMode) void tick().then(paint);
		// (the loop repaints continuously otherwise)
	});

	$effect(() => {
		if ($performanceMode) return;
		last = performance.now();
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	});

	function grab(e: PointerEvent, p: Packet, i: number) {
		// Left button only, and never start a drag from the card's own buttons.
		if (e.button !== 0) return;
		const b = bodies[i];
		if (!b) return;
		dragId = b.id;
		let moved = false;
		const rect = fieldEl!.getBoundingClientRect();
		const offX = b.x - (e.clientX - rect.left);
		const offY = b.y - (e.clientY - rect.top);
		let lastX = b.x;
		let lastY = b.y;
		let lastT = performance.now();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

		const move = (ev: PointerEvent) => {
			const r = fieldEl!.getBoundingClientRect();
			const nx = ev.clientX - r.left + offX;
			const ny = ev.clientY - r.top + offY;
			if (Math.abs(nx - b.x) + Math.abs(ny - b.y) > 3) moved = true;
			b.x = Math.max(b.w / 2, Math.min(r.width - b.w / 2, nx));
			b.y = Math.max(b.h / 2, Math.min(r.height - b.h / 2, ny));
			// Track the pointer's own speed so releasing throws the card with the
			// velocity it was actually moving at, rather than dropping it dead.
			const t = performance.now();
			const dt = Math.max((t - lastT) / 1000, 1 / 240);
			b.vx = (b.x - lastX) / dt;
			b.vy = (b.y - lastY) / dt;
			lastX = b.x;
			lastY = b.y;
			lastT = t;
		};
		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			dragId = null;
			// Cap the throw so a fast flick cannot send a card across the field
			// faster than the separation pass can resolve it.
			const sp = Math.hypot(b.vx, b.vy);
			if (sp > 900) { b.vx *= 900 / sp; b.vy *= 900 / sp; }
			// A click is a drag that never moved: that opens the card instead.
			if (!moved) {
				selected = selected === b.id ? null : b.id;
				playSound('click');
			}
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	}

	async function loadMessages() {
		messagesState = 'loading';
		try {
			const resp = await fetch('https://blog.krsz.in/api/guestbook');
			const data = (await resp.json()) as { messages?: GuestbookMessage[] };
			messages = (data.messages ?? []).filter((m) => m.approved);
			messagesState = 'ready';
		} catch {
			messagesState = 'error';
		}
	}

	onMount(() => {
		loadMessages();
	});

	function fmtTime(ts: string): string {
		const d = new Date(ts);
		return isNaN(d.getTime()) ? ts : d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
	}

	function handleCopy(text: string) {
		navigator.clipboard?.writeText(text);
		playSound('click');
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!gbName.trim() || !gbEmail.trim() || !gbContent.trim()) {
			gbStatus = 'ERROR: ALL FIELDS REQUIRED.';
			gbShakeGen++;
			playSound('click');
			return;
		}
		gbStatus = 'TRANSMITTING TO BLOG.KRSZ.IN...';
		playSound('click');

		try {
			const resp = await fetch('https://blog.krsz.in/api/guestbook', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: gbName.trim(), email: gbEmail.trim(), content: gbContent.trim() })
			});
			const data = (await resp.json().catch(() => ({}))) as { error?: string };
			if (resp.ok) {
				gbStatus = 'TRANSMITTED: 201 OK DISPATCHED TO BLOG GUESTBOOK';
				gbName = '';
				gbEmail = '';
				gbContent = '';
				playSound('power');
				loadMessages();
			} else {
				gbStatus = `ERROR: ${data.error || `HTTP ${resp.status}`}`;
				gbShakeGen++;
				playSound('click');
			}
		} catch (err: any) {
			gbStatus = `NETWORK ERROR: ${err?.message || 'TRANSMISSION FAILED'}`;
			gbShakeGen++;
			playSound('click');
		}
	}

	/** Re-plays .shake-once on every bump of `gen`, even repeats of the same value. */
	function shakeOn(node: HTMLElement, gen: number) {
		let last = gen;
		return {
			update(next: number) {
				if (next === last) return;
				last = next;
				node.classList.remove('shake-once');
				// Force a reflow so re-adding the class restarts the animation.
				void node.offsetWidth;
				node.classList.add('shake-once');
			}
		};
	}
</script>

<div class="space-y-3 sm:space-y-3.5 flex-1 flex flex-col min-h-0">
	<div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
		<AsciiArt
			color="#e06c75"
			class="text-[4px] sm:text-[6px] md:text-[8px] font-black tracking-tight leading-tight overflow-x-auto"
			art={` ██████╗ ██╗   ██╗███████╗███████╗████████╗██████╗  ██████╗  ██████╗ ██╗  ██╗
██╔════╝ ██║   ██║██╔════╝██╔════╝╚══██╔══╝██╔══██╗██╔═══██╗██╔═══██╗██║ ██╔╝
██║  ███╗██║   ██║█████╗  ███████╗   ██║   ██████╔╝██║   ██║██║   ██║█████╔╝
██║   ██║██║   ██║██╔══╝  ╚════██║   ██║   ██╔══██╗██║   ██║██║   ██║██╔═██╗
╚██████╔╝╚██████╔╝███████╗███████║   ██║   ██████╔╝╚██████╔╝╚██████╔╝██║  ██╗
 ╚═════╝  ╚═════╝ ╚══════╝╚══════╝   ╚═╝   ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═╝`}
		/>
		<div class="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm shrink-0">
			<button onclick={() => handleCopy('krsz.dev@gmail.com')} class="press border border-[#e06c75] px-2 py-0.5 rounded-xs text-[#e06c75] hover:bg-[#e06c75] hover:text-black cursor-pointer transition-colors">[krsz.dev@gmail.com]</button>
			<button onclick={() => handleCopy('admin@krsz.in')} class="press border border-[#e06c75] px-2 py-0.5 rounded-xs text-[#e06c75] hover:bg-[#e06c75] hover:text-black cursor-pointer transition-colors">[admin@krsz.in]</button>
		</div>
	</div>

	<form onsubmit={handleSubmit} use:shakeOn={gbShakeGen} class="border border-white/10 p-4 bg-black/30 space-y-3.5 text-xs sm:text-sm rounded-xs">
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
			<div class="space-y-1">
				<label class="block text-xs font-bold text-[#56b6c2]" for="gb-name">CALLSIGN / NAME</label>
				<div class="relative border border-white/20 focus-within:border-[#56b6c2] transition-colors bg-black/60 px-3 py-2 rounded-xs flex items-center min-h-[40px]">
					<span class="font-mono text-sm text-[#eceff4] whitespace-pre">{gbName}</span>{#if gbFocusedField === 'name'}<span
							class="inline-block w-[8px] h-[16px] shrink-0"
							style="background-color: {themeStyles.cursorColor}; opacity: {$pulseStep % 6 < 4 ? 0.9 : 0.2};"
						></span>{/if}
					{#if !gbName && gbFocusedField !== 'name'}
						<span class="text-xs opacity-40 select-none pointer-events-none">e.g. Satoshi</span>
					{/if}
					<input
						id="gb-name"
						type="text"
						required
						bind:value={gbName}
						onfocus={() => (gbFocusedField = 'name')}
						onblur={() => (gbFocusedField = null)}
						class="absolute inset-0 w-full h-full opacity-0 cursor-text outline-none font-mono z-10"
					/>
				</div>
			</div>
			<div class="space-y-1">
				<label class="block text-xs font-bold text-[#e5c07b]" for="gb-email">CONTACT EMAIL</label>
				<div class="relative border border-white/20 focus-within:border-[#e5c07b] transition-colors bg-black/60 px-3 py-2 rounded-xs flex items-center min-h-[40px]">
					<span class="font-mono text-sm text-[#eceff4] whitespace-pre">{gbEmail}</span>{#if gbFocusedField === 'email'}<span
							class="inline-block w-[8px] h-[16px] shrink-0"
							style="background-color: {themeStyles.cursorColor}; opacity: {$pulseStep % 6 < 4 ? 0.9 : 0.2};"
						></span>{/if}
					{#if !gbEmail && gbFocusedField !== 'email'}
						<span class="text-xs opacity-40 select-none pointer-events-none">e.g. dev@domain.com</span>
					{/if}
					<input
						id="gb-email"
						type="email"
						required
						bind:value={gbEmail}
						onfocus={() => (gbFocusedField = 'email')}
						onblur={() => (gbFocusedField = null)}
						class="absolute inset-0 w-full h-full opacity-0 cursor-text outline-none font-mono z-10"
					/>
				</div>
			</div>
		</div>

		<div class="space-y-1">
			<label class="block text-xs font-bold text-[#e06c75]" for="gb-content">TRANSMISSION PAYLOAD</label>
			<div class="relative border border-white/20 focus-within:border-[#e06c75] transition-colors bg-black/60 p-3 rounded-xs min-h-[80px]">
				<!-- The caret follows the text with no separator between them: under
				     whitespace-pre-wrap the newline that used to sit between the value
				     and this span rendered as a real space, so the caret floated a
				     character-width past the last glyph instead of sitting against it.
				     Kept on one line for that reason, and with no left margin. -->
				<div class="font-mono text-sm text-[#eceff4] whitespace-pre-wrap break-words leading-relaxed">{gbContent}{#if gbFocusedField === 'content'}<span
							class="inline-block w-[8px] h-[16px] align-text-bottom shrink-0"
							style="background-color: {themeStyles.cursorColor}; opacity: {$pulseStep % 6 < 4 ? 0.9 : 0.2};"
						></span>{/if}
					{#if !gbContent && gbFocusedField !== 'content'}
						<span class="text-xs opacity-40 select-none pointer-events-none block">Enter message for the blog.krsz.in guestbook...</span>
					{/if}
				</div>
				<textarea
					id="gb-content"
					required
					rows="3"
					bind:value={gbContent}
					onfocus={() => (gbFocusedField = 'content')}
					onblur={() => (gbFocusedField = null)}
					class="absolute inset-0 w-full h-full opacity-0 cursor-text outline-none resize-none font-mono z-10 p-3"
				></textarea>
			</div>
		</div>

		{#if gbStatus}
			<div class="border border-[#98c379] p-2.5 text-xs sm:text-sm font-bold text-[#98c379] bg-black/40 rounded-xs" in:fade={{ duration: 160 }}>{gbStatus}</div>
		{/if}
		<p class="text-[10px] sm:text-xs text-white/40 leading-relaxed">
			Unlike the rest of this site, this is sent to blog.krsz.in and shown publicly below. Sending confirms
			you're fine with that.
		</p>
		<button type="submit" class="press w-full border border-[#e06c75] bg-[#e06c75] text-black font-black py-2.5 text-xs sm:text-sm uppercase hover:opacity-90 cursor-pointer rounded-xs transition-opacity">DISPATCH PACKET TO BLOG.KRSZ.IN -&gt;</button>
	</form>

	<!-- Live feed from blog.krsz.in's guestbook API -- each message drifts
	     slowly around a bounded field instead of sitting in a static list,
	     like packets actually adrift on a network rather than log lines.
	     flex-1/min-h-0 so this claims whatever vertical room the form above
	     didn't use, down to a sane floor. -->
	<!-- The floor is what the packets actually have to move in: at 260px the
	     field itself came out around 170px, barely three card-heights, so the
	     separation pass had nowhere to put anything and the cards sat jammed
	     against each other. 380px gives it room to read as a field. -->
	<div class="border border-white/10 bg-black/30 rounded-xs p-3 flex flex-col gap-2 flex-1 min-h-[380px]">
		<BoxHeader title="RECEIVED PACKETS" short="PACKETS" class="text-xs font-black text-[#e06c75] border-b border-white/10 pb-1.5 shrink-0">
			<button
				onclick={() => {
					loadMessages();
					playSound('click');
				}}
				class="press text-xs font-bold text-white/50 hover:text-[#56b6c2] cursor-pointer transition-colors"
				title="Reload messages from blog.krsz.in"
			>
				⟳ REFRESH
			</button>
		</BoxHeader>

		{#if messagesState === 'loading'}
			<div class="text-xs font-mono text-white/40 py-2">FETCHING FROM BLOG.KRSZ.IN…</div>
		{:else if messagesState === 'error'}
			<div class="text-xs font-mono text-[#e06c75] py-2">FAILED TO REACH THE GUESTBOOK API — TRY REFRESH</div>
		{:else if messages.length === 0}
			<div class="text-xs font-mono text-white/40 py-2">NO MESSAGES YET — SEND THE FIRST PACKET</div>
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<!-- The field itself only listens so that clicking the empty space
			     between packets closes an open one; every packet is its own
			     focusable button, which is what actually carries the interaction. -->
			<div
				bind:this={fieldEl}
				role="list"
				class="relative flex-1 min-h-0 overflow-hidden rounded-xs touch-none"
				style="background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px); background-size: 22px 22px;"
				onpointerdown={(e) => { if (e.target === e.currentTarget) selected = null; }}
			>
				{#each bodies as p, i (p.id)}
						{@const open = selected === p.id}
						<!-- Positioned by the loop writing transform straight to this node;
						     left/top stay at 0 so translate3d is the only thing moving it. -->
						<div
							use:register={i}
							role="listitem"
							class="absolute left-0 top-0 will-change-transform"
							style="width: {open ? OPEN_W : CARD_W}px; z-index: {open ? 30 : 10};"
							in:fade={{ duration: 220 }}
						>
							<div
								role="button"
								tabindex="0"
								aria-expanded={open}
								aria-label="Message from {p.name}"
								onpointerdown={(e) => grab(e, p, i)}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selected = open ? null : p.id; playSound('click'); }
									if (e.key === 'Escape' && open) selected = null;
								}}
								class="border rounded-xs px-2 py-1.5 bg-black/80 backdrop-blur-[1px] select-none transition-[box-shadow,border-color] hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.7)] focus:outline-none focus-visible:ring-1"
								class:cursor-grab={!open}
								class:cursor-default={open}
								style="border-color: {p.color}{open ? 'cc' : '55'}; {open ? `height: ${OPEN_H}px;` : ''} --tw-ring-color: {p.color};"
							>
								<div class="flex items-baseline justify-between gap-1.5">
									<span class="text-[11px] font-bold truncate" style="color: {p.color}">{p.name}</span>
									<span class="text-[9px] font-mono text-white/30 shrink-0">{fmtTime(p.timestamp)}</span>
								</div>
								<div
									class="text-[10px] text-[#eceff4]/80 leading-snug mt-0.5 break-words"
									class:line-clamp-2={!open}
									class:overflow-y-auto={open}
									style={open ? `max-height: ${OPEN_H - 34}px;` : ''}
								>
									{p.content}
								</div>
							</div>
						</div>
					{/each}
			</div>
			<div class="text-[10px] font-mono text-white/30 shrink-0">
				{messages.length} messages · drag a packet to throw it · click to read it in full{$performanceMode ? '' : ' · they collide'} · new entries may await moderation
			</div>
		{/if}
	</div>
</div>

<style>
	/* The packets used to drift on a CSS keyframe per card. They are driven by
	   the rAF loop in the script now -- it has to own the transform anyway to
	   resolve collisions and carry a dragged card, and two writers on the same
	   property cannot be reconciled. Nothing is left to declare here: the loop
	   writes transform inline, and performance mode gates the loop itself
	   rather than relying on app.css's `animation: none`, which a rAF loop
	   never sees. */
	.cursor-grab:active {
		cursor: grabbing;
	}
</style>
