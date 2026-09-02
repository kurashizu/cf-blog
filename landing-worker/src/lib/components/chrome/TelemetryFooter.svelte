<script lang="ts">
	import { playSound } from '../../sound';
	import { resolvedTheme, THEME_STYLES } from '../../stores/theme';
	import { edgeTrace, edgeTraceMs, edgeTraceStatus, traceSummary } from '../../stores/edge';
	import PixelIcon from '../pixel/PixelIcon.svelte';

	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);

	/** Real `/cdn-cgi/trace` values — never a placeholder number. */
	let edgeLabel = $derived(
		$edgeTraceStatus === 'ok'
			? traceSummary($edgeTrace)
			: $edgeTraceStatus === 'probing'
				? 'TRACING EDGE…'
				: $edgeTraceStatus === 'unavailable'
					? 'EDGE TRACE N/A'
					: ''
	);
	let edgeTitle = $derived(
		$edgeTrace
			? `Served by Cloudflare PoP ${$edgeTrace.colo}${$edgeTrace.loc ? ` (${$edgeTrace.loc})` : ''} over ${$edgeTrace.http}, ${$edgeTrace.tls}${$edgeTrace.kex ? ` / ${$edgeTrace.kex}` : ''}${$edgeTraceMs === null ? '' : ` — trace round trip ${$edgeTraceMs}ms`}. Read live from /cdn-cgi/trace; type "trace" in the console for the full record.`
			: 'Cloudflare /cdn-cgi/trace — type "trace" in the console to probe the edge.'
	);

	const LINKS = [
		{ href: 'https://github.com/kurashizu', icon: 'github', label: '1:gh/kurashizu', title: 'GitHub Profile — Open https://github.com/kurashizu in a new tab', color: 'text-[#61afef] hover:text-[#98c379]' },
		{ href: 'https://huggingface.co/kurashizu', icon: 'huggingface', label: '2:hf/kurashizu', title: 'Hugging Face AI Models Hub — Open https://huggingface.co/kurashizu in a new tab', color: 'text-[#e5c07b] hover:text-[#e06c75]' },
		{ href: 'https://oshwhub.com/Kurashizu', icon: 'hardware', label: '3:oshwhub', title: 'OSHWHub Hardware Projects & PCB Schematics — Open https://oshwhub.com/Kurashizu in a new tab', color: 'text-[#e06c75] hover:text-[#56b6c2]' },
		{ href: 'https://skill.krsz.in/rules', icon: 'rules', label: '4:rules', title: 'Skill & System Rules Reference — Open https://skill.krsz.in/rules in a new tab', color: 'text-[#98c379] hover:text-[#56b6c2]' }
	] as const;

	/** Which build this is — commit and time baked in by vite.config.ts, never computed at runtime. */
	const BUILD_URL = __BUILD_COMMIT_FULL__
		? `https://github.com/kurashizu/cf-blog/commit/${__BUILD_COMMIT_FULL__}`
		: undefined;
	const BUILD_TITLE = `Build ${__BUILD_COMMIT__} — ${__BUILD_TIME__} (${__BUILD_TIME_SYDNEY__} Sydney)${BUILD_URL ? '. Open the commit on GitHub in a new tab.' : ''}`;
</script>

<!-- A single row, always: the two groups no longer wrap onto their own lines when
     the panel narrows. footer-fit is a container query context (the available
     width is the panel's, not the viewport's -- the sidebar changes it too), so
     link labels drop to icon-only before anything gets crowded, and the whole
     row falls back to a horizontal scroll only past the point where even that
     is too tight -- it never stacks. -->
<footer
	class="footer-fit w-full max-w-full {themeStyles.headerBgVideo} px-2.5 sm:px-3 py-1.5 sm:py-2 flex flex-nowrap items-center justify-between font-bold text-xs sm:text-sm tracking-wide border {themeStyles.border} rounded-b-sm mt-1.5 sm:mt-2 gap-1.5 overflow-x-auto custom-scrollbar"
>
	<div class="flex items-center gap-2 sm:gap-3 shrink-0">
		<span class="shrink-0">[0] 0:krsz.in*</span>
		<span class="opacity-40 text-white/30 hidden sm:inline shrink-0">|</span>
		{#each LINKS as link (link.href)}
			<a
				href={link.href}
				target="_blank"
				rel="noopener noreferrer"
				onclick={() => playSound('click')}
				title={link.title}
				class="hover:underline flex items-center gap-1 transition-colors shrink-0 {link.color}"
			>
				<PixelIcon name={link.icon} size={16} />
				<span class="footer-linklabel">{link.label}</span>
			</a>
		{/each}
	</div>

	<div class="flex items-center gap-2 sm:gap-3 shrink-0">
		<span class="text-[#e06c75] hidden sm:inline shrink-0">"krsz-edge-node"</span>
		{#if edgeLabel}
			<span
				data-tour="edge"
				title={edgeTitle}
				class="text-[11px] sm:text-xs shrink-0 {$edgeTraceStatus === 'ok' ? 'text-[#98c379]' : 'text-white/40'}"
			>
				{edgeLabel}
			</span>
		{/if}
		<span class="opacity-40 text-white/30 hidden sm:inline shrink-0">|</span>
		<span class="text-[10px] sm:text-xs text-white/40 whitespace-nowrap shrink-0" title={BUILD_TITLE}>
			{#if BUILD_URL}
				<a
					href={BUILD_URL}
					target="_blank"
					rel="noopener noreferrer"
					onclick={() => playSound('click')}
					class="hover:underline hover:text-white/70 transition-colors"
				>
					{__BUILD_COMMIT__}
				</a>
			{:else}
				{__BUILD_COMMIT__}
			{/if}
			<span class="hidden sm:inline"> · {__BUILD_TIME_SYDNEY__}</span>
		</span>
	</div>
</footer>

<style>
	.footer-fit {
		container-type: inline-size;
	}
	/* Link text is the first thing to give: the icon alone still identifies each
	   one (title carries the full name), and dropping it buys back real room
	   before anything more useful would have to go. */
	@container (max-width: 640px) {
		.footer-linklabel {
			display: none;
		}
	}
</style>
