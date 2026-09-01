<script lang="ts">
	import { onMount } from 'svelte';
	import { playSound } from '../../sound';
	import { resolvedTheme, THEME_STYLES } from '../../stores/theme';
	import { suspendNavHotkeys } from '../../stores/hotkeys';

	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);

	const WORDS =
		('the of and to in is you that it he was for on are as with his they at be this have from or one had by word but not what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first water been call who oil its now find long down day did get come made may part over new sound take only little work know place year live me back give most very after thing our just name good sentence man think say great where help through much before line right too mean old any same tell boy follow came want show also around form three small set put end does another well large must big even such because turn here why ask went men read need land different home us move try kind hand picture again change off play spell air away animal house point page letter mother answer found study still learn should world high every near add food between own below country plant last school father keep tree never start city earth eye light thought head under story saw left few while along might close something seem next hard open example begin life those both paper together got group often run')
			.split(' ');

	const DURATION = 30;

	let words = $state<string[]>([]);
	let wordIdx = $state(0);
	let typed = $state('');
	/** finished words: what the user actually typed for each */
	let submitted = $state<string[]>([]);
	let running = $state(false);
	let finished = $state(false);
	let timeLeft = $state(DURATION);
	let keystrokes = $state(0);
	let correctKeystrokes = $state(0);
	let timer: ReturnType<typeof setInterval> | null = null;
	let startedAt = 0;

	function shuffle(): string[] {
		const pool = [...WORDS];
		const out: string[] = [];
		for (let i = 0; i < 80; i++) out.push(pool[Math.floor(Math.random() * pool.length)]);
		return out;
	}

	function resetTest() {
		words = shuffle();
		wordIdx = 0;
		typed = '';
		submitted = [];
		running = false;
		finished = false;
		timeLeft = DURATION;
		keystrokes = 0;
		correctKeystrokes = 0;
		if (timer) clearInterval(timer);
		timer = null;
	}

	function start() {
		running = true;
		startedAt = performance.now();
		timer = setInterval(() => {
			timeLeft--;
			if (timeLeft <= 0) finish();
		}, 1000);
	}

	function finish() {
		running = false;
		finished = true;
		if (timer) clearInterval(timer);
		timer = null;
		playSound('power');
	}

	// stats — standard definitions: WPM counts correct chars (incl. one space per
	// correct word) / 5; accuracy is correct keystrokes over all keystrokes.
	let correctWords = $derived(submitted.filter((w, i) => w === words[i]).length);
	let correctChars = $derived(
		submitted.reduce((acc, w, i) => acc + (w === words[i] ? words[i].length + 1 : 0), 0)
	);
	let minutes = $derived((DURATION - timeLeft) / 60 || 1 / 60);
	let wpm = $derived(Math.round(correctChars / 5 / minutes));
	let accuracy = $derived(keystrokes === 0 ? 100 : Math.round((correctKeystrokes / keystrokes) * 100));

	function handleKeydown(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (finished) {
			if (e.key === 'Enter') {
				e.preventDefault();
				resetTest();
				playSound('click');
			}
			return;
		}
		if (e.key === 'Backspace') {
			e.preventDefault();
			typed = typed.slice(0, -1);
			return;
		}
		if (e.key === ' ') {
			e.preventDefault();
			if (!typed) return;
			submitted = [...submitted, typed];
			if (typed === words[wordIdx]) correctKeystrokes++;
			keystrokes++;
			wordIdx++;
			typed = '';
			if (wordIdx >= words.length) finish();
			return;
		}
		if (e.key.length !== 1) return;
		e.preventDefault();
		if (!running) start();
		keystrokes++;
		const target = words[wordIdx] ?? '';
		if (target[typed.length] === e.key) correctKeystrokes++;
		typed += e.key;
	}

	onMount(() => {
		resetTest();
		suspendNavHotkeys.set(true);
		window.addEventListener('keydown', handleKeydown);
		return () => {
			suspendNavHotkeys.set(false);
			window.removeEventListener('keydown', handleKeydown);
			if (timer) clearInterval(timer);
		};
	});

	function charClass(wi: number, ci: number, ch: string): string {
		if (wi < wordIdx) {
			const t = submitted[wi] ?? '';
			return t[ci] === ch ? 'text-[#98c379]' : 'text-[#e06c75]';
		}
		if (wi === wordIdx) {
			if (ci < typed.length) return typed[ci] === ch ? 'text-[#98c379]' : 'text-[#e06c75] underline';
			return 'text-white/70';
		}
		return 'text-white/35';
	}
</script>

<div class="space-y-2">
	<div class="flex flex-wrap items-center gap-1.5 text-xs font-mono">
		<span class="px-2 py-1 border rounded-xs font-black {running ? 'border-[#e5c07b] text-[#e5c07b]' : 'border-white/15 text-white/60'}">
			⏱ {timeLeft}s
		</span>
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60">
			WPM: <span class="font-black text-[#56b6c2]">{finished || running ? wpm : '—'}</span>
		</span>
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60">
			ACC: <span class="font-black text-[#c678dd]">{keystrokes > 0 ? `${accuracy}%` : '—'}</span>
		</span>
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60">
			WORDS: <span class="font-black text-[#98c379]">{correctWords}</span><span class="text-white/40">/{submitted.length}</span>
		</span>
		<button
			onclick={() => {
				resetTest();
				playSound('click');
			}}
			class="ml-auto px-2 py-1 border border-white/20 hover:border-[#56b6c2] text-white/60 hover:text-[#56b6c2] rounded-xs font-bold cursor-pointer transition-colors"
		>
			⟳ RESTART
		</button>
	</div>

	{#if finished}
		<div class="border p-4 rounded-xs text-center space-y-1.5" style="border-color: {themeStyles.cursorColor}66;">
			<div class="text-2xl font-black font-mono" style="color: {themeStyles.cursorColor}">{wpm} WPM</div>
			<div class="text-xs font-mono text-white/60">
				{accuracy}% accuracy · {correctWords}/{submitted.length} words correct in {DURATION}s
			</div>
			<div class="text-[10px] font-mono text-white/35">Press Enter or RESTART to go again</div>
		</div>
	{:else}
		<div class="border border-white/15 bg-black/50 rounded-xs p-3 font-mono text-sm sm:text-base leading-loose select-none min-h-[120px]">
			{#each words.slice(Math.max(0, wordIdx - 5), wordIdx + 25) as w, rel (Math.max(0, wordIdx - 5) + rel)}
				{@const wi = Math.max(0, wordIdx - 5) + rel}
				<!-- inline-block: Svelte trims inter-iteration whitespace, so without an
				     atomic inline there'd be no soft-wrap opportunity between words -->
				<span class="inline-block mr-[0.6em] {wi === wordIdx ? 'bg-white/10 rounded-xs px-0.5' : ''}">
					{#each w.split('') as ch, ci (ci)}<span class={charClass(wi, ci, ch)}>{ch}</span>{/each}{#if wi === wordIdx && typed.length > w.length}<span class="text-[#e06c75] underline">{typed.slice(w.length)}</span>{/if}{#if wi === wordIdx}<span class="inline-block w-[2px] h-[1em] align-middle animate-pulse" style="background-color: {themeStyles.cursorColor}"></span>{/if}
				</span>
			{/each}
		</div>
		<div class="text-[10px] font-mono text-white/40">
			{running ? 'GO — space submits a word, backspace edits' : 'Start typing to begin the 30-second test. Nav hotkeys are paused on this tool.'}
		</div>
	{/if}
</div>
