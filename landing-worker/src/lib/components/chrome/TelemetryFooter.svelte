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
		{ href: 'https://github.com/kurashizu', icon: 'github', label: '1:github', title: 'GitHub Profile — Open https://github.com/kurashizu in a new tab', color: 'text-[#61afef] hover:text-[#98c379]' },
		{ href: 'https://huggingface.co/kurashizu', icon: 'huggingface', label: '2:huggingface', title: 'Hugging Face AI Models Hub — Open https://huggingface.co/kurashizu in a new tab', color: 'text-[#e5c07b] hover:text-[#e06c75]' },
		{ href: 'https://oshwhub.com/Kurashizu', icon: 'hardware', label: '3:oshwhub', title: 'OSHWHub Hardware Projects & PCB Schematics — Open https://oshwhub.com/Kurashizu in a new tab', color: 'text-[#e06c75] hover:text-[#56b6c2]' },
		{ href: 'https://skill.krsz.in/rules', icon: 'rules', label: '4:rules', title: 'Skill & System Rules Reference — Open https://skill.krsz.in/rules in a new tab', color: 'text-[#98c379] hover:text-[#56b6c2]' }
	] as const;

	/** Which build this is — commit and time baked in by vite.config.ts, never computed at runtime. */
	const BUILD_URL = __BUILD_COMMIT_FULL__
		? `https://github.com/kurashizu/cf-blog/commit/${__BUILD_COMMIT_FULL__}`
		: undefined;
	const BUILD_TITLE = `Build ${__BUILD_COMMIT__} — ${__BUILD_TIME__} (${__BUILD_TIME_SYDNEY__} Sydney)${BUILD_URL ? '. Open the commit on GitHub in a new tab.' : ''}`;
</script>

<!-- A single row, always -- like TabBar, never a scrollbar: footer-fit is a
     container query root (the available width is the panel's, not the
     viewport's, since the sidebar changes it too) and content sheds itself in
     rank order as it narrows, same escalation TabBar uses for its own tabs and
     right-hand badges. Least essential first: the build time, the edge-node
     label and its dividers, the edge trace reading, then link text down to
     icon-only. [0] 0:krsz.in* and the commit hash are the two things that
     never go, so there is always a floor of real content, never an empty bar. -->
<footer
	class="footer-fit w-full max-w-full {themeStyles.headerBgVideo} px-2.5 sm:px-3 py-1.5 sm:py-2 flex flex-nowrap items-center justify-between font-bold text-xs sm:text-sm tracking-wide border {themeStyles.border} rounded-b-sm mt-1.5 sm:mt-2 footer-gap overflow-hidden"
>
	<div class="flex items-center footer-gap shrink-0 min-w-0">
		<span class="shrink-0">[0] 0:krsz.in*</span>
		<span class="footer-div opacity-40 text-white/30 shrink-0">|</span>
		{#each LINKS as link (link.href)}
			<a
				href={link.href}
				target="_blank"
				rel="noopener noreferrer"
				onclick={() => playSound('click')}
				title={link.title}
				class="press hover:underline flex items-center gap-1 transition-colors shrink-0 {link.color}"
			>
				<PixelIcon name={link.icon} size={16} />
				<span class="footer-linklabel">{link.label}</span>
			</a>
		{/each}
	</div>

	<div class="flex items-center footer-gap shrink-0 min-w-0">
		{#if edgeLabel}
			<span
				data-tour="edge"
				title={edgeTitle}
				class="footer-edgelabel shrink-0 inline-flex items-center gap-1 transition-colors {$edgeTraceStatus === 'ok' ? 'text-[#98c379]' : 'text-white/40'}"
			>
				{#if $edgeTraceStatus === 'ok'}
					<span class="w-1 h-1 rounded-full bg-[#98c379] blink-live"></span>
				{/if}
				{edgeLabel}
			</span>
		{/if}
		<span class="footer-div opacity-40 text-white/30 shrink-0">|</span>
		<span class="footer-copyright text-xs sm:text-sm text-white/40 shrink-0" title="© {new Date().getFullYear()} kurashizu">© kurashizu</span>
		<span class="text-[10px] sm:text-xs text-white/40 whitespace-nowrap shrink-0" title={BUILD_TITLE}>
			{#if BUILD_URL}
				<a
					href={BUILD_URL}
					target="_blank"
					rel="noopener noreferrer"
					onclick={() => playSound('click')}
					class="press hover:underline hover:text-white/70 transition-colors"
				>
					{__BUILD_COMMIT__}
				</a>
			{:else}
				{__BUILD_COMMIT__}
			{/if}
			<span class="footer-buildtime"> · {__BUILD_TIME_SYDNEY__}</span>
		</span>
	</div>
</footer>

<style>
	.footer-fit {
		container-type: inline-size;
	}
	.footer-gap {
		gap: 0.375rem;
	}
	@media (min-width: 640px) {
		.footer-gap {
			gap: 0.75rem;
		}
	}
	/* Last resort once every optional item is already gone (icon-only links,
	   [0] 0:krsz.in* and the commit hash) -- tightens the remaining gaps so the
	   irreducible floor still fits at the very narrowest real phone widths. */
	@container (max-width: 340px) {
		.footer-gap {
			gap: 0.25rem;
		}
	}
	.footer-edgelabel {
		font-size: 0.6875rem;
	}
	@media (min-width: 640px) {
		.footer-edgelabel {
			font-size: 0.75rem;
		}
	}
	/* Sheds in rank order as the panel narrows, same escalation TabBar uses for
	   its own tabs and right-hand badges -- each step hides one more thing,
	   never wraps, never scrolls. Thresholds are measured, not guessed: the
	   content at each stage (padding and gaps included) actually needs that
	   much room, checked against a full-width, nothing-hidden render. */
	@container (max-width: 1320px) {
		.footer-buildtime { display: none; }
	}
	@container (max-width: 1180px) {
		.footer-copyright { display: none; }
	}
	@container (max-width: 1030px) {
		.footer-div { display: none; }
	}
	@container (max-width: 990px) {
		.footer-edgelabel { display: none; }
	}
	@container (max-width: 790px) {
		.footer-linklabel { display: none; }
	}
</style>
