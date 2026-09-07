<script lang="ts">
	import BoxHeader from '../chrome/BoxHeader.svelte';
	import { onMount } from 'svelte';
	import { fade } from '$lib/perf-transitions';
	import { playSound } from '../../sound';
	import { t, locale } from '$lib/i18n';

	interface Footprint {
		source: 'stamp' | 'blog';
		id: string;
		country: string;
		timezone: string;
		browser: string;
		os: string;
		colo: string;
		at: string;
	}

	interface CountryCount {
		code: string;
		count: number;
	}

	interface Summary {
		total: number;
		countries: CountryCount[];
		recent: Footprint[];
	}

	const API = 'https://blog.krsz.in/api/footprints';
	const STAMP_KEY = 'krsz.footprint.stampedAt';
	const PALETTE = ['#e06c75', '#56b6c2', '#e5c07b', '#98c379', '#c678dd', '#61afef'];

	let wallState = $state<'loading' | 'ready' | 'error'>('loading');
	let summary = $state<Summary>({ total: 0, countries: [], recent: [] });
	let yourId = $state<string | null>(null);

	/** Bumped every 30s so relative timestamps ("3 m ago") keep advancing
	 *  without a full re-fetch of the wall. */
	let clock = $state(Date.now());

	type StampStatus = 'idle' | 'sending' | 'done' | 'already' | 'rate' | 'no-edge' | 'network';
	let stampStatus = $state<StampStatus>('idle');
	let stampedToday = $state(false);

	/** localStorage is guarded throughout: private mode throws on read as well
	 *  as write, and a wall stamp is never worth breaking the page over. */
	function readStampedAt(): string | null {
		try {
			return localStorage.getItem(STAMP_KEY);
		} catch {
			return null;
		}
	}

	function writeStampedAt(iso: string): void {
		try {
			localStorage.setItem(STAMP_KEY, iso);
		} catch {
			/* nothing to remember it with; the button will offer again */
		}
	}

	function isToday(iso: string | null): boolean {
		if (!iso) return false;
		const d = new Date(iso);
		if (isNaN(d.getTime())) return false;
		const now = new Date();
		return (
			d.getUTCFullYear() === now.getUTCFullYear() &&
			d.getUTCMonth() === now.getUTCMonth() &&
			d.getUTCDate() === now.getUTCDate()
		);
	}

	/** "DE" -> "Germany"; falls back to the code itself. */
	function countryName(code: string): string {
		if (!code) return code;
		try {
			return new Intl.DisplayNames([$locale], { type: 'region' }).of(code) ?? code;
		} catch {
			return code;
		}
	}

	/** "Asia/Tokyo" -> "Tokyo"; "America/Argentina/Buenos_Aires" -> "Buenos Aires". */
	function tzCity(tz: string): string {
		if (!tz) return '';
		const last = tz.split('/').pop() ?? tz;
		return last.replace(/_/g, ' ');
	}

	/** Deterministic colour per country code so the wall has rhythm without
	 *  flags or emoji -- same hash approach as the guestbook's seeded scatter. */
	function colorFor(code: string): string {
		let h = 0;
		for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
		return PALETTE[h % PALETTE.length];
	}

	function relativeTime(iso: string, now: number): string {
		const then = new Date(iso).getTime();
		if (isNaN(then)) return '';
		const diffS = Math.max(0, Math.floor((now - then) / 1000));
		if (diffS < 60) return $t('community.footprints.justNow');
		const m = Math.floor(diffS / 60);
		if (m < 60) return $t('community.footprints.minutesAgo', { n: m });
		const h = Math.floor(m / 60);
		if (h < 24) return $t('community.footprints.hoursAgo', { n: h });
		const d = Math.floor(h / 24);
		return $t('community.footprints.daysAgo', { n: d });
	}

	let topCountries = $derived(summary.countries.slice(0, 10));
	let maxCount = $derived(topCountries.length ? topCountries[0].count : 1);

	async function load() {
		wallState = 'loading';
		try {
			const resp = await fetch(API);
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const data = (await resp.json()) as Summary;
			summary = {
				total: data.total ?? 0,
				countries: data.countries ?? [],
				recent: data.recent ?? []
			};
			wallState = 'ready';
		} catch {
			wallState = 'error';
		}
	}

	async function stamp() {
		if (stampedToday || stampStatus === 'sending') return;
		stampStatus = 'sending';
		playSound('click');
		try {
			const resp = await fetch(API, { method: 'POST' });
			if (resp.status === 201) {
				const data = (await resp.json()) as { footprint: Footprint };
				const fp = data.footprint;
				yourId = fp.id;
				summary = {
					total: summary.total + 1,
					countries: bumpCountry(summary.countries, fp.country),
					recent: [fp, ...summary.recent]
				};
				writeStampedAt(fp.at);
				stampedToday = true;
				stampStatus = 'done';
				playSound('power');
			} else if (resp.status === 429) {
				const data = (await resp.json().catch(() => ({}))) as { error?: string };
				if (data.error === 'already') {
					writeStampedAt(new Date().toISOString());
					stampedToday = true;
					stampStatus = 'already';
				} else {
					stampStatus = 'rate';
				}
			} else if (resp.status === 503) {
				stampStatus = 'no-edge';
			} else {
				stampStatus = 'network';
			}
		} catch {
			stampStatus = 'network';
		}
	}

	function bumpCountry(list: CountryCount[], code: string): CountryCount[] {
		const idx = list.findIndex((c) => c.code === code);
		const next = idx >= 0 ? [...list] : [...list, { code, count: 0 }];
		const i = idx >= 0 ? idx : next.length - 1;
		next[i] = { ...next[i], count: next[i].count + 1 };
		return next.sort((a, b) => b.count - a.count);
	}

	onMount(() => {
		load();
		stampedToday = isToday(readStampedAt());
		const iv = setInterval(() => (clock = Date.now()), 30000);
		return () => clearInterval(iv);
	});
</script>

<div class="border border-white/10 bg-black/30 rounded-xs p-3 flex flex-col gap-2.5 text-xs sm:text-sm min-w-0">
	<BoxHeader title={$t('community.footprints.title')} short={$t('community.footprints.titleShort')} class="text-xs font-black text-[#61afef] border-b border-white/10 pb-1.5 shrink-0">
		<button
			onclick={() => {
				load();
				playSound('click');
			}}
			class="press text-xs font-bold text-white/50 hover:text-[#56b6c2] cursor-pointer transition-colors"
		>
			⟳
		</button>
	</BoxHeader>

	{#if wallState === 'loading'}
		<div class="text-xs font-mono text-white/40 py-2">{$t('community.footprints.loading')}</div>
	{:else if wallState === 'error'}
		<div class="text-xs font-mono text-[#e06c75] py-2">{$t('community.footprints.error')}</div>
	{:else}
		<div class="text-xs font-mono text-white/70" in:fade={{ duration: 160 }}>
			{#if summary.total === 0}
				{$t('community.footprints.summaryZero')}
			{:else if summary.total === 1}
				{$t('community.footprints.summaryOne')}
			{:else}
				{$t('community.footprints.summary', { total: summary.total, countries: summary.countries.length })}
			{/if}
		</div>

		{#if topCountries.length > 0}
			<div class="space-y-1 min-w-0">
				<div class="text-[10px] font-bold text-white/40 tracking-wide">{$t('community.footprints.countriesHeading')}</div>
				{#each topCountries as c (c.code)}
					{@const pct = Math.max(4, Math.round((c.count / maxCount) * 100))}
					<div class="flex items-center gap-1.5 min-w-0">
						<span class="w-6 shrink-0 text-[10px] font-mono font-bold" style="color: {colorFor(c.code)}">{c.code}</span>
						<span class="flex-1 min-w-0 h-3 bg-white/5 rounded-xs overflow-hidden">
							<span class="block h-full rounded-xs" style="width: {pct}%; background-color: {colorFor(c.code)};"></span>
						</span>
						<span class="w-5 shrink-0 text-right text-[10px] font-mono text-white/50">{c.count}</span>
						<span class="hidden sm:inline w-24 shrink-0 truncate text-[10px] text-white/40" title={countryName(c.code)}>{countryName(c.code)}</span>
					</div>
				{/each}
			</div>
		{/if}

		<div class="min-w-0">
			<div class="flex flex-wrap items-baseline justify-between gap-x-3 mb-1">
				<div class="text-[10px] font-bold text-white/40 tracking-wide">{$t('community.footprints.recentHeading')}</div>
				<div class="text-[9px] text-white/30 min-w-0">{$t('community.footprints.blogNote')}</div>
			</div>
			{#if summary.recent.length === 0}
				<div class="text-xs font-mono text-white/40 py-1">{$t('community.footprints.empty')}</div>
			{:else}
				<div class="max-h-40 overflow-y-auto space-y-1 pr-1">
					{#each summary.recent as fp (fp.id)}
						{@const mine = fp.id === yourId}
						<div
							class="flex items-center gap-1.5 min-w-0 border rounded-xs px-1.5 py-1 bg-black/40"
							style="border-color: {mine ? colorFor(fp.country) : 'rgba(255,255,255,0.08)'};"
							in:fade={{ duration: 160 }}
						>
							<span class="shrink-0 text-[9px] font-mono font-bold px-1 rounded-xs" style="color: {colorFor(fp.country)}; border: 1px solid {colorFor(fp.country)}66;">{fp.country}</span>
							<span class="flex-1 min-w-0 truncate text-[10px] text-white/70">{countryName(fp.country)}</span>
							{#if fp.timezone}
								<span class="hidden sm:inline shrink-0 truncate max-w-[80px] text-[9px] text-white/35">{tzCity(fp.timezone)}</span>
							{/if}
							<span class="hidden md:inline shrink-0 truncate max-w-[100px] text-[9px] text-white/35">
								{fp.browser || $t('community.footprints.unknownBrowser')} / {fp.os || $t('community.footprints.unknownOs')}
							</span>
							{#if fp.source === 'blog'}
								<span class="shrink-0 text-[8px] font-mono px-1 rounded-xs border border-white/15 text-white/35" title={$t('community.footprints.sourceBlogTitle')}>{$t('community.footprints.sourceBlog')}</span>
							{/if}
							{#if mine}
								<span class="shrink-0 text-[9px] font-black text-[#98c379]">{$t('community.footprints.you')}</span>
							{/if}
							<span class="shrink-0 text-[9px] font-mono text-white/30">{relativeTime(fp.at, clock)}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="pt-1 border-t border-white/10 space-y-1.5">
			{#if stampStatus === 'already' || (stampedToday && stampStatus === 'idle')}
				<div class="text-[10px] sm:text-xs font-bold text-white/40">{$t('community.footprints.alreadyStamped')}</div>
			{:else if stampStatus === 'done'}
				<div class="text-[10px] sm:text-xs font-bold text-[#98c379]">{$t('community.footprints.stamped')}</div>
			{:else if stampStatus === 'rate'}
				<div class="text-[10px] sm:text-xs font-bold text-[#e06c75]">{$t('community.footprints.errorRate')}</div>
			{:else if stampStatus === 'no-edge'}
				<div class="text-[10px] sm:text-xs font-bold text-[#e06c75]">{$t('community.footprints.errorNoEdge')}</div>
			{:else if stampStatus === 'network'}
				<div class="text-[10px] sm:text-xs font-bold text-[#e06c75]">{$t('community.footprints.errorNetwork', { reason: 'fetch failed' })}</div>
			{/if}
			<div class="flex flex-wrap items-center gap-2">
				<button
					onclick={stamp}
					disabled={stampedToday || stampStatus === 'sending'}
					class="press border border-[#61afef] px-3 py-1.5 rounded-xs text-[#61afef] font-bold text-xs hover:bg-[#61afef] hover:text-black cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#61afef]"
				>
					{stampStatus === 'sending' ? $t('community.footprints.stamping') : $t('community.footprints.stamp')}
				</button>
				<p class="flex-1 min-w-[140px] text-[10px] text-white/40 leading-relaxed">
					{$t('community.footprints.disclaimer')}
				</p>
			</div>
		</div>
	{/if}
</div>
