<script lang="ts">
	import { onMount } from 'svelte';
	import { playSound } from '../../sound';
	import { t } from '$lib/i18n';

	/** Bump to re-trigger .value-in on the result number even if it repeats the same ms. */
	let resultGen = $state(0);

	type Phase = 'idle' | 'waiting' | 'go' | 'result' | 'early';

	let phase = $state<Phase>('idle');
	let results = $state<number[]>([]);
	let lastMs = $state<number | null>(null);
	let goAt = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;

	let best = $derived(results.length ? Math.min(...results) : null);
	let avg = $derived(results.length ? Math.round(results.reduce((a, b) => a + b, 0) / results.length) : null);

	function arm() {
		phase = 'waiting';
		lastMs = null;
		timer = setTimeout(() => {
			phase = 'go';
			goAt = performance.now();
		}, 1200 + Math.random() * 2800);
	}

	function handleClick() {
		if (phase === 'idle' || phase === 'result' || phase === 'early') {
			playSound('click');
			arm();
			return;
		}
		if (phase === 'waiting') {
			// clicked before green — false start
			if (timer) clearTimeout(timer);
			timer = null;
			phase = 'early';
			playSound('click');
			return;
		}
		if (phase === 'go') {
			lastMs = Math.round(performance.now() - goAt);
			results = [...results, lastMs].slice(-10);
			phase = 'result';
			resultGen++;
			playSound('toggle');
		}
	}

	function reset() {
		if (timer) clearTimeout(timer);
		timer = null;
		phase = 'idle';
		results = [];
		lastMs = null;
		playSound('click');
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
		const target = e.target as HTMLElement | null;
		if (['input', 'textarea'].includes(target?.tagName?.toLowerCase() ?? '')) return;
		// preventDefault also stops a focused <button> from firing click on keyup —
		// otherwise Space would double-trigger through the same gesture.
		e.preventDefault();
		handleClick();
	}

	onMount(() => () => {
		if (timer) clearTimeout(timer);
	});
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="space-y-2">
	<div class="flex flex-wrap items-center gap-1.5 text-xs font-mono">
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60">
			{$t('utilities.reaction.last')} <span class="font-black text-[#e5c07b] inline-block">{#key `${lastMs}-${resultGen}`}<span class="value-in inline-block">{lastMs === null ? '—' : $t('utilities.reaction.ms', { ms: lastMs })}</span>{/key}</span>
		</span>
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60">
			{$t('utilities.reaction.best')} <span class="font-black text-[#98c379] inline-block">{#key best}<span class="value-in inline-block">{best === null ? '—' : $t('utilities.reaction.ms', { ms: best })}</span>{/key}</span>
		</span>
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60">
			{$t('utilities.reaction.avg')} <span class="font-black text-[#56b6c2] inline-block">{#key avg}<span class="value-in inline-block">{avg === null ? '—' : $t('utilities.reaction.ms', { ms: avg })}</span>{/key}</span>
			<span class="text-white/50">({results.length}/10)</span>
		</span>
		<button onclick={reset} class="press ml-auto px-2 py-1 border border-white/20 hover:border-[#e06c75] text-white/60 hover:text-[#e06c75] rounded-xs font-bold cursor-pointer transition-colors">
			{$t('utilities.reaction.reset')}
		</button>
	</div>

	<button
		onclick={handleClick}
		class="press w-full min-h-[260px] rounded-xs border font-mono cursor-pointer transition-colors duration-100 flex flex-col items-center justify-center gap-2 select-none
			{phase === 'waiting' ? 'bg-[#e06c75]/25 border-[#e06c75]' : phase === 'go' ? 'bg-[#98c379]/30 border-[#98c379]' : 'bg-black/50 border-white/15 hover:border-white/40'}
			{phase === 'early' ? 'shake-once' : ''}"
	>
		{#if phase === 'idle'}
			<span class="text-sm font-black text-white/80">{$t('utilities.reaction.idle.title')}</span>
			<span class="text-xs text-white/60">{$t('utilities.reaction.idle.hint')}</span>
		{:else if phase === 'waiting'}
			<span class="text-sm font-black text-[#e06c75]">{$t('utilities.reaction.waiting')}</span>
		{:else if phase === 'go'}
			<span class="text-2xl font-black text-[#98c379]">{$t('utilities.reaction.go')}</span>
		{:else if phase === 'early'}
			<span class="text-sm font-black text-[#e06c75]">{$t('utilities.reaction.early.title')}</span>
			<span class="text-xs text-white/60">{$t('utilities.reaction.early.hint')}</span>
		{:else}
			<span class="text-3xl font-black text-[#e5c07b] value-in">{$t('utilities.reaction.ms', { ms: lastMs ?? 0 })}</span>
			<span class="text-xs text-white/60">{$t('utilities.reaction.result.hint')}</span>
		{/if}
	</button>
</div>
