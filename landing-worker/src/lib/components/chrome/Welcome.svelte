<script lang="ts">
	import { fade, fly } from '$lib/perf-transitions';
	import KrszLogo from './KrszLogo.svelte';
	import { playSound } from '../../sound';
	import { resolvedTheme, THEME_STYLES } from '../../stores/theme';
	import { privacyOpen } from '../../stores/chrome';

	let { onDone }: { onDone: () => void } = $props();

	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);
	/** Same reasoning as BootSequence: a static literal so Tailwind's scanner
	 *  actually generates backdrop-blur-xl, plus cardBgVideo's own colour with
	 *  its own (weaker) blur suffix stripped off. */
	let bgColorClass = $derived(themeStyles.cardBgVideo.replace(/\s*backdrop-blur-\S+/, ''));

	/** Mirrors Sidebar.svelte's HOTKEY_TILES -- same eight views, same colours,
	 *  so the preview grid here reads as the same set rather than a second,
	 *  slightly different one. */
	const VIEWS = [
		{ key: '0', title: 'MODULES', desc: 'Live projects', color: '#56b6c2', icon: '◈' },
		{ key: '1', title: 'GUESTBOOK', desc: 'Packet messages', color: '#e06c75', icon: '✉' },
		{ key: '2', title: 'SYNTH', desc: '8-track WebAudio', color: '#c678dd', icon: '♫' },
		{ key: '3', title: 'UTILITIES', desc: 'Hardware testers', color: '#e5c07b', icon: '⌨' },
		{ key: '4', title: 'LM.SPACE', desc: 'Model table as a volume', color: '#98c379', icon: '▤' },
		{ key: '5', title: 'KRSZ-VM', desc: 'x86 PC, emulated', color: '#d19a66', icon: '⬢' },
		{ key: '6', title: 'CHATBOT', desc: 'On-GPU, no server', color: '#61afef', icon: '◑' },
		{ key: '7', title: 'LIFE.LAB', desc: "Conway's Game of Life", color: '#98c379', icon: '⬗' }
	];

	let closing = $state(false);
	const EXIT_MS = 220;

	function finish() {
		if (closing) return;
		closing = true;
		setTimeout(onDone, EXIT_MS);
	}

	function start() {
		playSound('power');
		finish();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			start();
		} else if (e.key === 'Escape') {
			finish();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- The first screen a new visitor sees after the POST completes, before the
     anchored walkthrough starts pointing at specific chrome. Same translucent
     cardBgVideo-over-blur-xl treatment as BootSequence -- one continuous look
     through boot -> welcome -> tour rather than three different overlay
     styles in a row. transform-gpu for the same Safari backdrop-filter
     repaint reason documented on +layout.svelte's data-tour="panel". -->
<div
	class="fixed inset-0 z-[190] {bgColorClass} backdrop-blur-xl text-[#d8dee9] font-mono overflow-y-auto custom-scrollbar transform-gpu transition-opacity duration-200 {closing
		? 'opacity-0'
		: 'opacity-100'}"
	in:fade={{ duration: 280 }}
>
	<div class="min-h-full flex flex-col items-center justify-center p-4 sm:p-8">
		<div class="w-full max-w-2xl space-y-5 sm:space-y-6 py-8">
			<div class="flex flex-col items-center text-center gap-3" in:fly={{ y: -10, duration: 320, opacity: 0 }}>
				<KrszLogo size={56} />
				<div class="space-y-1.5">
					<h1 class="text-2xl sm:text-4xl font-black tracking-tight text-[#eceff4]">Welcome to krsz.in</h1>
					<p class="text-xs sm:text-sm text-white/55 max-w-md mx-auto leading-relaxed">
						Kurashizu's random-stuff zone — eight real, working tools in one edge-native workbench.
						Everything you see is live, not a mockup.
					</p>
				</div>
			</div>

			<div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2" in:fly={{ y: 10, duration: 320, delay: 80, opacity: 0 }}>
				{#each VIEWS as v (v.key)}
					<div class="border border-white/15 bg-black/30 rounded-xs p-2 flex flex-col gap-0.5 min-w-0">
						<div class="flex items-center justify-between">
							<span class="px-1 py-0.2 rounded-xs font-mono font-bold text-[10px] border" style="border-color: {v.color}; color: {v.color}">[{v.key}]</span>
							<span class="text-sm leading-none" style="color: {v.color}">{v.icon}</span>
						</div>
						<div class="text-[11px] font-bold truncate" style="color: {v.color}">{v.title}</div>
						<div class="text-[10px] text-white/45 truncate">{v.desc}</div>
					</div>
				{/each}
			</div>

			<div class="flex flex-col items-center gap-2 pt-1" in:fade={{ duration: 300, delay: 120 }}>
				<button
					onclick={start}
					class="press modal-pop px-6 py-2.5 border-2 border-[#98c379] bg-[#98c379]/15 text-[#98c379] rounded-xs text-sm font-black tracking-wide cursor-pointer hover:bg-[#98c379] hover:text-black transition-colors"
				>
					LET'S GET STARTED →
				</button>
				<p class="text-[10px] text-white/35">
					By clicking "let's get started", you agree to our
					<button onclick={() => privacyOpen.set(true)} class="underline hover:text-white/60 cursor-pointer transition-colors">privacy policy</button>.
				</p>
				<button onclick={finish} class="press text-xs text-white/40 hover:text-white cursor-pointer transition-colors">
					skip — I've got it
				</button>
			</div>
		</div>
	</div>
</div>
