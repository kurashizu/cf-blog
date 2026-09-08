<script lang="ts">
	import { onMount } from 'svelte';
	import Dropdown from '../chrome/Dropdown.svelte';
	import AsciiArt from '../chrome/AsciiArt.svelte';
	import { playSound } from '../../sound';
	import { t, locale } from '$lib/i18n';
	import { Button, TextInput, Dialog } from '$lib/components/ui';
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
		/** Message keys, resolved at render via $t -- this table is built once at
		 *  module init, so the label/short/hint text cannot be baked in here. */
		labelKey: string;
		shortKey: string;
		hintKey: string;
		color: string;
		/** null when the model has no value for this metric. */
		value: (m: LeaderboardModel) => number | null;
		format: (v: number) => string;
		/** Sort direction that puts "best" first. */
		bestIsLow: boolean;
	}

	const METRICS: Metric[] = [
		{
			key: 'intelligence',
			labelKey: 'community.leaderboard.metricIntelligence',
			shortKey: 'community.leaderboard.metricIntelligenceShort',
			hintKey: 'community.leaderboard.metricIntelligenceHint',
			color: '#56b6c2',
			value: (m) => m.evaluations?.artificial_analysis_intelligence_index ?? null,
			format: (v) => v.toFixed(1),
			bestIsLow: false
		},
		{
			key: 'coding',
			labelKey: 'community.leaderboard.metricCoding',
			shortKey: 'community.leaderboard.metricCodingShort',
			hintKey: 'community.leaderboard.metricCodingHint',
			color: '#98c379',
			value: (m) => m.evaluations?.artificial_analysis_coding_index ?? null,
			format: (v) => v.toFixed(1),
			bestIsLow: false
		},
		{
			key: 'agentic',
			labelKey: 'community.leaderboard.metricAgentic',
			shortKey: 'community.leaderboard.metricAgenticShort',
			hintKey: 'community.leaderboard.metricAgenticHint',
			color: '#c678dd',
			value: (m) => m.evaluations?.artificial_analysis_agentic_index ?? null,
			format: (v) => v.toFixed(1),
			bestIsLow: false
		},
		{
			key: 'price',
			labelKey: 'community.leaderboard.metricPrice',
			shortKey: 'community.leaderboard.metricPriceShort',
			hintKey: 'community.leaderboard.metricPriceHint',
			color: '#e5c07b',
			value: (m) => m.pricing?.price_1m_blended_3_to_1 ?? null,
			format: (v) => (v === 0 ? 'free' : `$${v < 1 ? v.toFixed(2) : v.toFixed(v < 10 ? 2 : 0)}`),
			bestIsLow: true
		},
		{
			key: 'speed',
			labelKey: 'community.leaderboard.metricSpeed',
			shortKey: 'community.leaderboard.metricSpeedShort',
			hintKey: 'community.leaderboard.metricSpeedHint',
			color: '#61afef',
			value: (m) => m.median_output_tokens_per_second ?? null,
			format: (v) => v.toFixed(0),
			bestIsLow: false
		},
		{
			key: 'ttft',
			labelKey: 'community.leaderboard.metricLatency',
			shortKey: 'community.leaderboard.metricLatencyShort',
			hintKey: 'community.leaderboard.metricLatencyHint',
			color: '#e06c75',
			value: (m) => m.median_time_to_first_token_seconds ?? null,
			format: (v) => `${v.toFixed(v < 10 ? 2 : 1)}s`,
			bestIsLow: true
		},
		{
			key: 'date',
			labelKey: 'community.leaderboard.metricReleased',
			shortKey: 'community.leaderboard.metricReleasedShort',
			hintKey: 'community.leaderboard.metricReleasedHint',
			color: '#d19a66',
			value: (m) => (m.release_date ? Date.parse(m.release_date) || null : null),
			format: () => '',
			bestIsLow: false
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

	/** The model whose detail dialog is open. */
	let popover = $state<{ model: LeaderboardModel } | null>(null);

	function rowKey(m: LeaderboardModel): string {
		return `${m.slug}|${m.name}`;
	}

	function openCard(m: LeaderboardModel) {
		if (popover && rowKey(popover.model) === rowKey(m)) {
			popover = null;
			return;
		}
		popover = { model: m };
		playSound('click');
	}

	/** Every field the payload carries for one model, with nothing filled in.
	 *  `labelKey` is resolved with $t at render, so the row keeps its own
	 *  identity (row.labelKey) for the {#each} key while the shown text follows
	 *  the locale. */
	function detailRows(m: LeaderboardModel): { labelKey: string; value: string }[] {
		const price = m.pricing ?? {};
		const num = (v: number | null | undefined, unit = '') => (v === null || v === undefined ? '—' : `${v}${unit}`);
		return [
			{ labelKey: 'community.leaderboard.detailSlug', value: m.slug || '—' },
			{ labelKey: 'community.leaderboard.detailCreator', value: m.model_creator?.name ?? '—' },
			{ labelKey: 'community.leaderboard.detailReleased', value: m.release_date ?? '—' },
			{ labelKey: 'community.leaderboard.detailIntelligence', value: num(m.evaluations?.artificial_analysis_intelligence_index) },
			{ labelKey: 'community.leaderboard.detailCoding', value: num(m.evaluations?.artificial_analysis_coding_index) },
			{ labelKey: 'community.leaderboard.detailAgentic', value: num(m.evaluations?.artificial_analysis_agentic_index) },
			{ labelKey: 'community.leaderboard.detailBlended', value: price.price_1m_blended_3_to_1 === null || price.price_1m_blended_3_to_1 === undefined ? '—' : `$${price.price_1m_blended_3_to_1} / 1M` },
			{ labelKey: 'community.leaderboard.detailInput', value: price.price_1m_input_tokens === null || price.price_1m_input_tokens === undefined ? '—' : `$${price.price_1m_input_tokens} / 1M` },
			{ labelKey: 'community.leaderboard.detailOutput', value: price.price_1m_output_tokens === null || price.price_1m_output_tokens === undefined ? '—' : `$${price.price_1m_output_tokens} / 1M` },
			{ labelKey: 'community.leaderboard.detailSpeed', value: num(m.median_output_tokens_per_second, ' tok/s') },
			{ labelKey: 'community.leaderboard.detailTtft', value: num(m.median_time_to_first_token_seconds, ' s') }
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
		return $t('community.leaderboard.rankOf', { rank: ranked.indexOf(mine) + 1, total: ranked.length });
	}

	let fetchedLabel = $derived(
		$leaderboard?.fetchedAt
			? new Intl.DateTimeFormat($locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Sydney' }).format(
					new Date($leaderboard.fetchedAt)
				)
			: null
	);

	onMount(() => {
		void loadLeaderboard();
	});
</script>

<div class="space-y-3 flex-1 min-h-0 flex flex-col">
	<div class="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 pb-2 shrink-0">
		<AsciiArt
			color="#56b6c2"
			class="text-[4px] sm:text-[6px] md:text-[8px] font-black tracking-tight leading-tight overflow-x-auto"
			art={`██╗     ███████╗ █████╗ ██████╗ ███████╗██████╗ ██████╗  ██████╗  █████╗ ██████╗ ██████╗
██║     ██╔════╝██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔═══██╗██╔══██╗██╔══██╗██╔══██╗
██║     █████╗  ███████║██║  ██║█████╗  ██████╔╝██████╔╝██║   ██║███████║██████╔╝██║  ██║
██║     ██╔══╝  ██╔══██║██║  ██║██╔══╝  ██╔══██╗██╔══██╗██║   ██║██╔══██║██╔══██╗██║  ██║
███████╗███████╗██║  ██║██████╔╝███████╗██║  ██║██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝
╚══════╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═╝╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ `}
		/>

		<div class="text-[10px] sm:text-xs font-mono text-white/60 text-right leading-relaxed max-w-[440px]">
			<div>
				{$t('community.leaderboard.sourcePrefix')} <span class="text-[#e5c07b]">Artificial Analysis</span> {$t('community.leaderboard.sourceSuffix')}
				{#if $leaderboard?.intelligenceIndexVersion}
					<span class="text-white/60">{$t('community.leaderboard.indexVersion', { version: $leaderboard.intelligenceIndexVersion })}</span>
				{/if}
			</div>
			<div class="text-white/50">
				{$t('community.leaderboard.cachedBy')}
				<a href={LEADERBOARD_URL} target="_blank" rel="noopener noreferrer" class="text-[#61afef] hover:underline">blog.krsz.in</a>
			</div>
			{#if fetchedLabel}
				<div class="text-[#98c379]">
					{$t('community.leaderboard.fetchedLine', { when: fetchedLabel, count: models.length })}
					{#if $leaderboardMs !== null}<span class="text-white/50">{$t('community.leaderboard.loadMs', { ms: $leaderboardMs })}</span>{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Sort selector: the chosen metric drives both the ordering and the bars -->
	<div class="flex flex-wrap items-center gap-1.5 shrink-0" role="group" aria-label={$t('community.leaderboard.rankBy')}>
		<span class="text-[10px] font-mono font-bold text-white/60 uppercase mr-0.5" aria-hidden="true">{$t('community.leaderboard.rankBy')}</span>
		{#each METRICS as m (m.key)}
			<Button
				variant="neutral"
				color={m.color}
				active={sortKey === m.key}
				onclick={() => pick(m.key)}
				title={$t('community.leaderboard.metricHint', {
					hint: $t(m.hintKey),
					direction: m.bestIsLow ? $t('community.leaderboard.lowerBetter') : $t('community.leaderboard.higherBetter')
				})}
			>
				{$t(m.labelKey)}
			</Button>
		{/each}
	</div>

	<div class="flex flex-wrap items-center gap-2 shrink-0">
		<TextInput
			bind:value={query}
			label={$t('community.leaderboard.filterPlaceholder')}
			labelHidden
			placeholder={$t('community.leaderboard.filterPlaceholder')}
			color="#56b6c2"
			class="min-w-[180px] flex-1 max-w-[320px]"
		/>
		<Dropdown
			bind:value={creator}
			color="#61afef"
			width="220px"
			placeholder={$t('community.leaderboard.allCreators')}
			title={$t('community.leaderboard.filterByCreator')}
			options={[
				{ value: '', label: $t('community.leaderboard.allCreators'), note: String(creators.length) },
				...creators.map((c) => ({ value: c, label: c }))
			]}
		/>
		<div class="flex items-center gap-1" role="group" aria-label={$t('community.leaderboard.limitGroupLabel')}>
			{#each LIMITS as n (n)}
				<Button
					variant="neutral"
					active={limit === n}
					onclick={() => (limit = n)}
				>
					{n === 0 ? $t('community.leaderboard.limitAll') : $t('community.leaderboard.limitTop', { n })}
				</Button>
			{/each}
		</div>
		<span class="text-[10px] font-mono text-white/50">{$t('community.leaderboard.matchCount', { count: filtered.length })}</span>
	</div>

	{#if $leaderboardStatus === 'loading'}
		<div class="text-xs font-mono text-white/60">{$t('community.leaderboard.loading')}</div>
	{:else if $leaderboardStatus === 'error'}
		<div class="text-xs font-mono text-[#e06c75]">
			{$t('community.leaderboard.loadError', { error: $leaderboardError ?? '' })}
			<button onclick={() => loadLeaderboard(true)} class="press ml-2 underline cursor-pointer hover:text-white transition-colors">{$t('community.leaderboard.retry')}</button>
		</div>
	{/if}

	{#if shown.length}
		<div class="flex-1 min-h-0 overflow-auto custom-scrollbar border border-white/10 rounded-xs">
			<table class="w-full text-xs font-mono border-collapse">
				<thead class="sticky top-0 bg-[#14161b] z-10">
					<tr class="text-[10px] uppercase text-white/60 border-b border-white/15">
						<th scope="col" class="text-right px-2 py-1.5 w-10">{$t('community.leaderboard.colRank')}</th>
						<th scope="col" class="text-left px-2 py-1.5">{$t('community.leaderboard.colModel')}</th>
						<th scope="col" class="text-left px-2 py-1.5 hidden md:table-cell">{$t('community.leaderboard.colCreator')}</th>
						<th scope="col" aria-sort={sortKey === metric.key ? (metric.bestIsLow ? 'ascending' : 'descending') : undefined} class="text-left px-2 py-1.5 w-[110px] sm:w-[160px]" style="color: {metric.color}">
							{$t(metric.shortKey)} {metric.bestIsLow ? '↑' : '↓'}
						</th>
						{#each METRICS.filter((m) => m.key !== sortKey) as m (m.key)}
							<th scope="col" class="text-right px-2 py-1.5 hidden lg:table-cell">
								<button
									onclick={() => pick(m.key)}
									title={$t('community.leaderboard.sortByHint', {
										hint: $t(m.hintKey),
										direction: m.bestIsLow ? $t('community.leaderboard.lowerBetter') : $t('community.leaderboard.higherBetter')
									})}
									aria-label={$t('community.leaderboard.sortByHint', {
										hint: $t(m.hintKey),
										direction: m.bestIsLow ? $t('community.leaderboard.lowerBetter') : $t('community.leaderboard.higherBetter')
									})}
									class="press cursor-pointer hover:text-white transition-colors uppercase"
								>
									{$t(m.shortKey)}
								</button>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each shown as m, i (m.slug + m.name)}
						{@const open = popover !== null && rowKey(popover.model) === rowKey(m)}
						<tr
							onclick={() => openCard(m)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(m); }
							}}
							tabindex="0"
							aria-label={$t('community.leaderboard.rowDetailHint')}
							title={$t('community.leaderboard.rowDetailHint')}
							class="border-b border-white/5 last:border-0 cursor-pointer transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/60 {open
								? 'bg-white/10'
								: 'hover:bg-white/5'}"
						>
							<td class="px-2 py-1 text-right text-white/50">{i + 1}</td>
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

		<div class="text-[10px] font-mono text-white/50 shrink-0">
			{$t('community.leaderboard.footerHint')}
			{#if limit !== 0 && sorted.length > limit}
				{$t('community.leaderboard.showingOf', { shown: shown.length, total: sorted.length })}
			{/if}
		</div>
	{/if}
</div>

{#if popover}
	{@const m = popover.model}
	<Dialog title={m.name} label={m.name} size="md" onClose={() => (popover = null)} panelClass="font-mono" bodyClass="p-2.5 space-y-2">
		<div class="grid grid-cols-2 sm:grid-cols-3 gap-1">
			{#each detailRows(m) as row (row.labelKey)}
				<div class="border border-white/10 bg-black/40 rounded-xs px-2 py-1 flex items-baseline justify-between gap-2">
					<span class="text-[10px] text-white/60 shrink-0">{$t(row.labelKey)}</span>
					<span class="text-[11px] text-[#d8dee9] truncate" title={row.value}>{row.value}</span>
				</div>
			{/each}
		</div>

		<div class="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/60 border-t border-white/10 pt-1.5">
			<span class="text-white/50">{$t('community.leaderboard.rankAmong', { count: filtered.length })}</span>
			{#each METRICS.filter((x) => x.key !== 'date') as x (x.key)}
				<span>{$t(x.shortKey)} <span style="color: {x.color}">{rankFor(m, x)}</span></span>
			{/each}
		</div>

		<div class="flex flex-wrap items-center gap-x-4 gap-y-1">
			<Button
				variant="link"
				onclick={() => {
					query = m.model_creator?.name ?? '';
					popover = null;
				}}
				class="text-[10px] text-white/60"
			>
				{$t('community.leaderboard.filterToCreator', { creator: m.model_creator?.name ?? $t('community.leaderboard.thisCreator') })}
			</Button>
			{#if m.slug}
				<a
					href={`https://artificialanalysis.ai/models/${encodeURIComponent(m.slug)}`}
					target="_blank"
					rel="noopener noreferrer"
					class="press text-[10px] text-[#61afef] hover:underline"
				>
					{$t('community.leaderboard.openOnSource')}
				</a>
			{/if}
		</div>
	</Dialog>
{/if}
