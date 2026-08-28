<script lang="ts">
	import { playSound } from '../../sound';
	import { theme, THEME_STYLES } from '../../stores/theme';
	import { edgeTrace, edgeTraceMs, edgeTraceStatus, traceSummary } from '../../stores/edge';
	import PixelIcon from '../pixel/PixelIcon.svelte';

	let themeStyles = $derived(THEME_STYLES[$theme]);

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
</script>

<footer
	class="w-full max-w-full {themeStyles.headerBg} px-2.5 sm:px-3 py-1.5 sm:py-2 flex flex-wrap items-center justify-between font-bold text-xs sm:text-sm tracking-wide border {themeStyles.border} rounded-b-sm mt-1.5 sm:mt-2 gap-1.5"
>
	<div class="flex flex-wrap items-center gap-2 sm:gap-3">
		<span>[0] 0:krsz.in*</span>
		<span class="opacity-40 text-white/30 hidden sm:inline">|</span>
		{#each LINKS as link (link.href)}
			<a
				href={link.href}
				target="_blank"
				rel="noopener noreferrer"
				onclick={() => playSound('click')}
				title={link.title}
				class="hover:underline flex items-center gap-1 transition-colors {link.color}"
			>
				<PixelIcon name={link.icon} size={13} />
				<span>{link.label}</span>
			</a>
		{/each}
	</div>

	<div class="flex items-center gap-2 sm:gap-3">
		<span class="text-[#e06c75] hidden sm:inline">"krsz-edge-node"</span>
		{#if edgeLabel}
			<span
				data-tour="edge"
				title={edgeTitle}
				class="text-[11px] sm:text-xs {$edgeTraceStatus === 'ok' ? 'text-[#98c379]' : 'text-white/40'}"
			>
				{edgeLabel}
			</span>
		{/if}
	</div>
</footer>
