<script lang="ts">
	import BoxHeader from '../chrome/BoxHeader.svelte';
	import AsciiArt from '../chrome/AsciiArt.svelte';
	import { onMount } from 'svelte';
	import { fade } from '$lib/perf-transitions';
	import { playSound } from '../../sound';
	import { resolvedTheme, THEME_STYLES } from '../../stores/theme';
	import { pulseStep } from '../../stores/clock';

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

	/** One message plus the randomized drift it was assigned at load time --
	 *  rolled once per message, not on every render, so a card doesn't jump
	 *  to a new path on some unrelated reactive update. */
	interface FloatingPacket extends GuestbookMessage {
		left: number;
		top: number;
		dx: number;
		dy: number;
		duration: number;
		delay: number;
		color: string;
	}

	const PACKET_COLORS = ['#e06c75', '#56b6c2', '#e5c07b', '#98c379', '#c678dd', '#61afef'];

	/** Scatters messages across the floating field and gives each its own slow
	 *  bob -- a fixed seed per id (not Math.random on every reactive pass)
	 *  so the layout doesn't reshuffle every time `messages` is reassigned
	 *  for an unrelated reason. */
	function seededRandom(seed: string): () => number {
		let h = 0;
		for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
		return () => {
			h = (h * 1103515245 + 12345) >>> 0;
			return h / 4294967296;
		};
	}

	function toFloatingPackets(msgs: GuestbookMessage[]): FloatingPacket[] {
		return msgs.map((m, i) => {
			const rand = seededRandom(m.id);
			return {
				...m,
				// Card position is its CENTER (translate(-50%, -50%) below), not its
				// left/top edge -- at a fixed pixel card width inside a variable-
				// width percentage-based field, anchoring by the edge means the
				// widest cards can run off the right/bottom on a narrow container;
				// anchoring by the center bounds the overflow to half the card's
				// own size on either side instead of its full size on one side.
				left: 12 + rand() * 76,
				top: 14 + rand() * 72,
				dx: (rand() - 0.5) * 12,
				dy: (rand() - 0.5) * 12,
				duration: 14 + rand() * 10,
				delay: -rand() * 20,
				color: PACKET_COLORS[i % PACKET_COLORS.length]
			};
		});
	}

	let messages = $state<GuestbookMessage[]>([]);
	let packets = $derived(toFloatingPackets(messages));
	let messagesState = $state<'loading' | 'ready' | 'error'>('loading');

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
					<span class="font-mono text-sm text-[#eceff4] whitespace-pre">{gbName}</span>
					{#if gbFocusedField === 'name'}
						<span class="inline-block w-[8px] h-[16px] ml-0.5 align-middle shrink-0" style="background-color: {themeStyles.cursorColor}; opacity: {$pulseStep % 6 < 4 ? 0.9 : 0.2};"></span>
					{/if}
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
					<span class="font-mono text-sm text-[#eceff4] whitespace-pre">{gbEmail}</span>
					{#if gbFocusedField === 'email'}
						<span class="inline-block w-[8px] h-[16px] ml-0.5 align-middle shrink-0" style="background-color: {themeStyles.cursorColor}; opacity: {$pulseStep % 6 < 4 ? 0.9 : 0.2};"></span>
					{/if}
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
				<div class="font-mono text-sm text-[#eceff4] whitespace-pre-wrap break-words leading-relaxed">
					{gbContent}
					{#if gbFocusedField === 'content'}
						<span class="inline-block w-[8px] h-[16px] ml-0.5 align-middle shrink-0" style="background-color: {themeStyles.cursorColor}; opacity: {$pulseStep % 6 < 4 ? 0.9 : 0.2};"></span>
					{/if}
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
	<div class="border border-white/10 bg-black/30 rounded-xs p-3 flex flex-col gap-2 flex-1 min-h-[260px]">
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
			<div class="relative flex-1 min-h-0 overflow-hidden rounded-xs" style="background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px); background-size: 22px 22px;">
				{#each packets as p (p.id)}
					<div
						class="packet-float group absolute w-[150px] sm:w-[170px]"
						style="left: {p.left}%; top: {p.top}%; --dx: calc(-50% + {p.dx}px); --dy: calc(-50% + {p.dy}px); animation-duration: {p.duration}s; animation-delay: {p.delay}s;"
						in:fade={{ duration: 220 }}
					>
						<div
							class="border rounded-xs px-2 py-1.5 bg-black/70 backdrop-blur-[1px] cursor-default transition-[transform,box-shadow] hover:scale-[1.08] hover:z-20 hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.7)]"
							style="border-color: {p.color}55;"
							title={p.content}
						>
							<div class="flex items-baseline justify-between gap-1.5">
								<span class="text-[11px] font-bold truncate" style="color: {p.color}">{p.name}</span>
								<span class="text-[9px] font-mono text-white/30 shrink-0">{fmtTime(p.timestamp)}</span>
							</div>
							<div class="text-[10px] text-[#eceff4]/80 leading-snug mt-0.5 line-clamp-2 group-hover:line-clamp-none">
								{p.content}
							</div>
						</div>
					</div>
				{/each}
			</div>
			<div class="text-[10px] font-mono text-white/30 shrink-0">{messages.length} messages · hover a packet to read it in full · new entries may await moderation</div>
		{/if}
	</div>
</div>

<style>
	/* Each packet bobs along its own small, randomized (--dx, --dy) offset --
	   duration/delay are set inline per card (see toFloatingPackets) so the
	   whole field doesn't move in lockstep. Both keyframe endpoints carry the
	   -50% recentering (the card's left/top is its own center, not its edge,
	   so it can't be pushed out of bounds by its own width/height at the
	   field's edges) baked into --dx/--dy themselves, since a keyframe
	   can't compose an animated transform with a separate static one on the
	   same property. Held on hover via the paused state below so the
	   content can actually be read. Performance mode's universal
	   `animation: none !important` (app.css) already stops this outright,
	   so no separate gate is needed here. */
	.packet-float {
		animation-name: krsz-packet-drift;
		animation-timing-function: ease-in-out;
		animation-iteration-count: infinite;
		animation-direction: alternate;
		transform: translate(-50%, -50%);
	}
	.packet-float:hover {
		animation-play-state: paused;
	}
	@keyframes krsz-packet-drift {
		from {
			transform: translate(-50%, -50%);
		}
		to {
			transform: translate(var(--dx), var(--dy));
		}
	}
</style>
