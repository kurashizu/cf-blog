<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
	import Dropdown from '../chrome/Dropdown.svelte';
	import AsciiArt from '../chrome/AsciiArt.svelte';
	import { playSound } from '../../sound';
	import {
		loadLeaderboard,
		leaderboard,
		leaderboardStatus,
		leaderboardError,
		leaderboardMs,
		LEADERBOARD_URL,
		type LeaderboardModel
	} from '../../stores/leaderboard';

	type MetricKey = 'intelligence' | 'coding' | 'agentic' | 'price' | 'speed' | 'ttft' | 'date';

	interface Metric {
		key: MetricKey;
		label: string;
		short: string;
		color: string;
		/** null when the model has no value for this metric. */
		value: (m: LeaderboardModel) => number | null;
		format: (v: number) => string;
		/** Sort direction that puts "best" first. */
		bestIsLow: boolean;
		hint: string;
	}

	const METRICS: Metric[] = [
		{
			key: 'intelligence',
			label: 'INTELLIGENCE',
			short: 'INTEL',
			color: '#56b6c2',
			value: (m) => m.evaluations?.artificial_analysis_intelligence_index ?? null,
			format: (v) => v.toFixed(1),
			bestIsLow: false,
			hint: 'Artificial Analysis Intelligence Index'
		},
		{
			key: 'coding',
			label: 'CODING',
			short: 'CODE',
			color: '#98c379',
			value: (m) => m.evaluations?.artificial_analysis_coding_index ?? null,
			format: (v) => v.toFixed(1),
			bestIsLow: false,
			hint: 'Artificial Analysis Coding Index'
		},
		{
			key: 'agentic',
			label: 'AGENTIC',
			short: 'AGENT',
			color: '#c678dd',
			value: (m) => m.evaluations?.artificial_analysis_agentic_index ?? null,
			format: (v) => v.toFixed(1),
			bestIsLow: false,
			hint: 'Artificial Analysis Agentic Index'
		},
		{
			key: 'price',
			label: 'PRICE',
			short: '$/1M',
			color: '#e5c07b',
			value: (m) => m.pricing?.price_1m_blended_3_to_1 ?? null,
			format: (v) => (v === 0 ? 'free' : `$${v < 1 ? v.toFixed(2) : v.toFixed(v < 10 ? 2 : 0)}`),
			bestIsLow: true,
			hint: 'USD per 1M tokens, blended 3:1 input:output'
		},
		{
			key: 'speed',
			label: 'SPEED',
			short: 'TOK/S',
			color: '#61afef',
			value: (m) => m.median_output_tokens_per_second ?? null,
			format: (v) => v.toFixed(0),
			bestIsLow: false,
			hint: 'Median output tokens per second'
		},
		{
			key: 'ttft',
			label: 'LATENCY',
			short: 'TTFT',
			color: '#e06c75',
			value: (m) => m.median_time_to_first_token_seconds ?? null,
			format: (v) => `${v.toFixed(v < 10 ? 2 : 1)}s`,
			bestIsLow: true,
			hint: 'Median time to first token, seconds'
		},
		{
			key: 'date',
			label: 'RELEASED',
			short: 'DATE',
			color: '#d19a66',
			value: (m) => (m.release_date ? Date.parse(m.release_date) || null : null),
			format: () => '',
			bestIsLow: false,
			hint: 'Model release date'
		}
	];

	const LIMITS = [25, 50, 100, 0];

	let sortKey = $state<MetricKey>('intelligence');
	let query = $state('');
	let creator = $state('');
	let limit = $state(25);

	let metric = $derived(METRICS.find((m) => m.key === sortKey) ?? METRICS[0]);
	let models = $derived($leaderboard?.models ?? []);

	let creators = $derived(
		[...new Set(models.map((m) => m.model_creator?.name).filter((n): n is string => !!n))].sort((a, b) =>
			a.localeCompare(b)
		)
	);

	let filtered = $derived(
		models.filter((m) => {
			if (creator && m.model_creator?.name !== creator) return false;
			if (!query.trim()) return true;
			const q = query.trim().toLowerCase();
			return m.name.toLowerCase().includes(q) || (m.model_creator?.name ?? '').toLowerCase().includes(q);
		})
	);

	/** Models without a value for the active metric sort last, never as zero. */
	let sorted = $derived(
		[...filtered].sort((a, b) => {
			const av = metric.value(a);
			const bv = metric.value(b);
			if (av === null && bv === null) return a.name.localeCompare(b.name);
			if (av === null) return 1;
			if (bv === null) return -1;
			return metric.bestIsLow ? av - bv : bv - av;
		})
	);

	let shown = $derived(limit === 0 ? sorted : sorted.slice(0, limit));
	/** Bar scale over the rows on screen, so the top row always fills the bar. */
	let scaleMax = $derived(
		Math.max(...shown.map((m) => metric.value(m) ?? 0).filter((v) => Number.isFinite(v)), 0) || 1
	);

	function barWidth(m: LeaderboardModel): number {
		const v = metric.value(m);
		if (v === null || sortKey === 'date') return 0;
		if (metric.bestIsLow) {
			// Cheaper / faster reads as a longer bar.
			return v <= 0 ? 100 : Math.max(2, Math.min(100, (Math.min(...shown.map((x) => metric.value(x) ?? Infinity)) / v) * 100));
		}
		return Math.max(2, Math.min(100, (v / scaleMax) * 100));
	}

	function cell(m: LeaderboardModel, key: MetricKey): string {
		const spec = METRICS.find((x) => x.key === key)!;
		const v = spec.value(m);
		if (v === null) return '—';
		if (key === 'date') return m.release_date?.slice(0, 10) ?? '—';
		return spec.format(v);
	}

	function pick(key: MetricKey) {
		sortKey = key;
		playSound('click');
	}

	/** The model whose card is open, anchored where it was clicked. */
	let popover = $state<{ model: LeaderboardModel; x: number; y: number } | null>(null);
	let cardEl: HTMLDivElement | undefined = $state();
	let cardPos = $state({ left: 0, top: 0 });

	function rowKey(m: LeaderboardModel): string {
		return `${m.slug}|${m.name}`;
	}

	function openCard(m: LeaderboardModel, e: MouseEvent) {
		if (popover && rowKey(popover.model) === rowKey(m)) {
			popover = null;
			return;
		}
		popover = { model: m, x: e.clientX, y: e.clientY };
		playSound('click');
	}

	/**
	 * This view is mounted inside +layout.svelte's routed panel, which carries
	 * `transform-gpu` (a Safari backdrop-filter repaint fix). Any transform,
	 * even the identity matrix, creates a new containing block for descendant
	 * `position: fixed` elements -- so without this, the popover's own
	 * left/top math would be correct on paper but render offset by wherever
	 * that panel sits, landing nowhere near the click. Same fix and same
	 * reasoning as Onboarding.svelte's own portal().
	 */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	/**
	 * Park the card beside the pointer, then pull it back inside the viewport —
	 * a row near the bottom or the right edge would otherwise open off-screen.
	 */
	function placeCard() {
		if (!popover || !cardEl) return;
		const gap = 14;
		const w = cardEl.offsetWidth;
		const h = cardEl.offsetHeight;
		const left = Math.max(8, Math.min(popover.x + gap, window.innerWidth - w - 8));
		const top = Math.max(8, Math.min(popover.y + gap, window.innerHeight - h - 8));
		cardPos = { left, top };
	}

	$effect(() => {
		if (!popover) return;
		// Measure after the card exists, then again once fonts settle.
		requestAnimationFrame(placeCard);
	});

	/** Every field the payload carries for one model, with nothing filled in. */
	function detailRows(m: LeaderboardModel): { label: string; value: string }[] {
		const price = m.pricing ?? {};
		const num = (v: number | null | undefined, unit = '') => (v === null || v === undefined ? '—' : `${v}${unit}`);
		return [
			{ label: 'slug', value: m.slug || '—' },
			{ label: 'creator', value: m.model_creator?.name ?? '—' },
			{ label: 'released', value: m.release_date ?? '—' },
			{ label: 'intelligence', value: num(m.evaluations?.artificial_analysis_intelligence_index) },
			{ label: 'coding', value: num(m.evaluations?.artificial_analysis_coding_index) },
			{ label: 'agentic', value: num(m.evaluations?.artificial_analysis_agentic_index) },
			{ label: 'blended 3:1', value: price.price_1m_blended_3_to_1 === null || price.price_1m_blended_3_to_1 === undefined ? '—' : `$${price.price_1m_blended_3_to_1} / 1M` },
			{ label: 'input', value: price.price_1m_input_tokens === null || price.price_1m_input_tokens === undefined ? '—' : `$${price.price_1m_input_tokens} / 1M` },
			{ label: 'output', value: price.price_1m_output_tokens === null || price.price_1m_output_tokens === undefined ? '—' : `$${price.price_1m_output_tokens} / 1M` },
			{ label: 'output speed', value: num(m.median_output_tokens_per_second, ' tok/s') },
			{ label: 'time to first token', value: num(m.median_time_to_first_token_seconds, ' s') }
		];
	}

	/** Where this model sits in the full filtered set for a metric, ignoring the current sort. */
	function rankFor(m: LeaderboardModel, spec: Metric): string {
		const mine = spec.value(m);
		if (mine === null) return '—';
		const ranked = filtered
			.map((x) => spec.value(x))
			.filter((v): v is number => v !== null)
			.sort((a, b) => (spec.bestIsLow ? a - b : b - a));
		return `#${ranked.indexOf(mine) + 1} of ${ranked.length}`;
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && popover) {
			e.stopPropagation();
			popover = null;
		}
	}

	let fetchedLabel = $derived(
		$leaderboard?.fetchedAt
			? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Sydney' }).format(
					new Date($leaderboard.fetchedAt)
				)
			: null
	);

	onMount(() => {
		void loadLeaderboard();
	});
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="space-y-3 flex-1 min-h-0 flex flex-col">
	<div class="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 pb-2 shrink-0">
		<AsciiArt
			fit
			color="#56b6c2"
			class="font-black tracking-tight leading-none"
			art={`██╗     ███████╗ █████╗ ██████╗ ███████╗██████╗ ██████╗  ██████╗  █████╗ ██████╗ ██████╗
██║     ██╔════╝██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔═══██╗██╔══██╗██╔══██╗██╔══██╗
██║     █████╗  ███████║██║  ██║█████╗  ██████╔╝██████╔╝██║   ██║███████║██████╔╝██║  ██║
██║     ██╔══╝  ██╔══██║██║  ██║██╔══╝  ██╔══██╗██╔══██╗██║   ██║██╔══██║██╔══██╗██║  ██║
███████╗███████╗██║  ██║██████╔╝███████╗██║  ██║██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝
╚══════╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═╝╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ `}
		/>

		<div class="text-[10px] sm:text-xs font-mono text-white/45 text-right leading-relaxed max-w-[440px]">
			<div>
				Source: <span class="text-[#e5c07b]">Artificial Analysis</span> language-models API
				{#if $leaderboard?.intelligenceIndexVersion}
					<span class="text-white/60">· index v{$leaderboard.intelligenceIndexVersion}</span>
				{/if}
			</div>
			<div class="text-white/35">
				cached by cache.krsz.in into D1, read from
				<a href={LEADERBOARD_URL} target="_blank" rel="noopener noreferrer" class="text-[#61afef] hover:underline">blog.krsz.in</a>
			</div>
			{#if fetchedLabel}
				<div class="text-[#98c379]">
					upstream fetched {fetchedLabel} · {models.length} models
					{#if $leaderboardMs !== null}<span class="text-white/35"> · {$leaderboardMs}ms to load here</span>{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Sort selector: the chosen metric drives both the ordering and the bars -->
	<div class="flex flex-wrap items-center gap-1.5 shrink-0">
		<span class="text-[10px] font-mono font-bold text-white/40 uppercase mr-0.5">RANK BY</span>
		{#each METRICS as m (m.key)}
			<button
				onclick={() => pick(m.key)}
				title={`${m.hint} — ${m.bestIsLow ? 'lower is better' : 'higher is better'}`}
				class="press px-2 py-1 border rounded-xs text-xs font-bold cursor-pointer transition-colors {sortKey === m.key
					? 'bg-white/15 text-white'
					: 'border-white/20 text-white/55 hover:border-white/50'}"
				style={sortKey === m.key ? `border-color: ${m.color}; color: ${m.color}` : undefined}
			>
				{m.label}
			</button>
		{/each}
	</div>

	<div class="flex flex-wrap items-center gap-2 shrink-0">
		<input
			type="text"
			bind:value={query}
			placeholder="filter by model or creator…"
			class="focus-glow px-2 py-1 bg-black/60 border border-white/20 rounded-xs text-xs font-mono text-[#d8dee9] outline-none min-w-[180px] flex-1 max-w-[320px] transition-colors"
			style="--krsz-focus-color: #56b6c2"
		/>
		<Dropdown
			bind:value={creator}
			color="#61afef"
			width="220px"
			placeholder="all creators"
			title="Filter by model creator"
			options={[
				{ value: '', label: 'all creators', note: String(creators.length) },
				...creators.map((c) => ({ value: c, label: c }))
			]}
		/>
		<div class="flex items-center gap-1">
			{#each LIMITS as n (n)}
				<button
					onclick={() => (limit = n)}
					class="press px-2 py-1 border rounded-xs text-xs font-bold cursor-pointer transition-colors {limit === n
						? 'border-white bg-white/15 text-white'
						: 'border-white/20 text-white/55 hover:border-white/50'}"
				>
					{n === 0 ? 'ALL' : `TOP ${n}`}
				</button>
			{/each}
		</div>
		<span class="text-[10px] font-mono text-white/35">{filtered.length} match{filtered.length === 1 ? '' : 'es'}</span>
	</div>

	{#if $leaderboardStatus === 'loading'}
		<div class="text-xs font-mono text-white/45">Loading the model table…</div>
	{:else if $leaderboardStatus === 'error'}
		<div class="text-xs font-mono text-[#e06c75]">
			Could not load the leaderboard: {$leaderboardError}
			<button onclick={() => loadLeaderboard(true)} class="press ml-2 underline cursor-pointer hover:text-white transition-colors">retry</button>
		</div>
	{/if}

	{#if shown.length}
		<div class="flex-1 min-h-0 overflow-auto custom-scrollbar border border-white/10 rounded-xs">
			<table class="w-full text-xs font-mono border-collapse">
				<thead class="sticky top-0 bg-[#14161b] z-10">
					<tr class="text-[10px] uppercase text-white/40 border-b border-white/15">
						<th class="text-right px-2 py-1.5 w-10">#</th>
						<th class="text-left px-2 py-1.5">model</th>
						<th class="text-left px-2 py-1.5 hidden md:table-cell">creator</th>
						<th class="text-left px-2 py-1.5 w-[110px] sm:w-[160px]" style="color: {metric.color}">
							{metric.short} {metric.bestIsLow ? '↑' : '↓'}
						</th>
						{#each METRICS.filter((m) => m.key !== sortKey) as m (m.key)}
							<th class="text-right px-2 py-1.5 hidden lg:table-cell">
								<button
									onclick={() => pick(m.key)}
									title={`Sort by ${m.hint} — ${m.bestIsLow ? 'lower is better' : 'higher is better'}`}
									class="press cursor-pointer hover:text-white transition-colors uppercase"
								>
									{m.short}
								</button>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each shown as m, i (m.slug + m.name)}
						{@const open = popover !== null && rowKey(popover.model) === rowKey(m)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<tr
							onclick={(e) => openCard(m, e)}
							title="Every field the source has for this model"
							class="border-b border-white/5 last:border-0 cursor-pointer transition-colors {open
								? 'bg-white/10'
								: 'hover:bg-white/5'}"
						>
							<td class="px-2 py-1 text-right text-white/35">{i + 1}</td>
							<td class="px-2 py-1 text-[#eceff4] max-w-[240px] truncate" title={m.name}>{m.name}</td>
							<td class="px-2 py-1 text-white/50 hidden md:table-cell max-w-[130px] truncate">
								{m.model_creator?.name ?? '—'}
							</td>
							<td class="px-2 py-1">
								<div class="flex items-center gap-1.5">
									<div class="h-2 rounded-xs shrink-0 transition-[width] duration-200 ease-out" style="width: {barWidth(m) * 0.6}px; background: {metric.color}; opacity: 0.75"></div>
									<span class="font-bold shrink-0" style="color: {metric.color}">{cell(m, sortKey)}</span>
								</div>
							</td>
							{#each METRICS.filter((x) => x.key !== sortKey) as x (x.key)}
								<td class="px-2 py-1 text-right text-white/60 hidden lg:table-cell">{cell(m, x.key)}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="text-[10px] font-mono text-white/30 shrink-0">
			Click a row for every field the source carries, or a column heading to rank by it. Blank
			cells mean Artificial Analysis has no measurement for that model — nothing is inferred.
			{#if limit !== 0 && sorted.length > limit}
				Showing {shown.length} of {sorted.length}; press ALL for the rest.
			{/if}
		</div>
	{/if}
</div>

{#if popover}
	{@const m = popover.model}
	<div use:portal>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[120]" onclick={() => (popover = null)} transition:fade={{ duration: 180 }}></div>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={cardEl}
		class="fixed z-[130] w-[min(560px,92vw)] bg-[#121417] border rounded-xs shadow-[0_12px_32px_rgba(0,0,0,0.8)] font-mono"
		style="left: {cardPos.left}px; top: {cardPos.top}px; border-color: {metric.color}80"
		onclick={(e) => e.stopPropagation()}
		transition:scale={{ duration: 180, start: 0.96, opacity: 0, easing: cubicOut }}
	>
		<div class="flex items-start justify-between gap-2 px-2.5 py-1.5 border-b border-white/10">
			<span class="text-xs font-black" style="color: {metric.color}">{m.name}</span>
			<button onclick={() => (popover = null)} class="press text-[10px] text-white/40 hover:text-white cursor-pointer shrink-0 transition-colors">
				[ ✕ ]
			</button>
		</div>

		<div class="p-2.5 space-y-2">
			<div class="grid grid-cols-2 sm:grid-cols-3 gap-1">
				{#each detailRows(m) as row (row.label)}
					<div class="border border-white/10 bg-black/40 rounded-xs px-2 py-1 flex items-baseline justify-between gap-2">
						<span class="text-[10px] text-white/40 shrink-0">{row.label}</span>
						<span class="text-[11px] text-[#d8dee9] truncate" title={row.value}>{row.value}</span>
					</div>
				{/each}
			</div>

			<div class="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/45 border-t border-white/10 pt-1.5">
				<span class="text-white/30">rank among the {filtered.length} filtered:</span>
				{#each METRICS.filter((x) => x.key !== 'date') as x (x.key)}
					<span>{x.short} <span style="color: {x.color}">{rankFor(m, x)}</span></span>
				{/each}
			</div>

			<div class="flex flex-wrap items-center gap-x-4 gap-y-1">
				<button
					onclick={() => {
						query = m.model_creator?.name ?? '';
						popover = null;
					}}
					class="press text-[10px] text-white/45 hover:text-white cursor-pointer underline transition-colors"
				>
					filter the table to {m.model_creator?.name ?? 'this creator'}
				</button>
				{#if m.slug}
					<a
						href={`https://artificialanalysis.ai/models/${encodeURIComponent(m.slug)}`}
						target="_blank"
						rel="noopener noreferrer"
						class="press text-[10px] text-[#61afef] hover:underline"
					>
						open on Artificial Analysis ↗
					</a>
				{/if}
			</div>
		</div>
	</div>
	</div>
{/if}
