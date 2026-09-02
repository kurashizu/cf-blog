<script lang="ts">
	import { fade, scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
	import BoxHeader from './BoxHeader.svelte';
	import { resolvedTheme, THEME_STYLES } from '../../stores/theme';

	let { onClose }: { onClose: () => void } = $props();

	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);

	/** Kept in one place so a real link is never hand-typed twice. */
	const MODULE_LINKS = [
		{ name: 'blog.krsz.in', href: 'https://blog.krsz.in' },
		{ name: 'agent.krsz.in', href: 'https://agent.krsz.in' },
		{ name: 'share.krsz.in', href: 'https://share.krsz.in' },
		{ name: 'sharetube.krsz.in', href: 'https://sharetube.krsz.in' },
		{ name: 'mail.krsz.in', href: 'https://mail.krsz.in' },
		{ name: 'skill.krsz.in', href: 'https://skill.krsz.in' }
	];
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-[195] bg-black/70 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-2 sm:p-6 overflow-y-auto"
	onclick={onClose}
	transition:fade={{ duration: 180 }}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="w-full max-w-xl {themeStyles.cardBgVideo} border {themeStyles.border} rounded-sm shadow-[0_16px_48px_rgba(0,0,0,0.8)] font-mono my-auto"
		onclick={(e) => e.stopPropagation()}
		transition:scale={{ duration: 180, start: 0.96, opacity: 0, easing: cubicOut }}
	>
		<BoxHeader title="PRIVACY_NOTICE // KRSZ.IN" short="PRIVACY" class="text-xs sm:text-sm font-black px-3 py-2 border-b {themeStyles.border} {themeStyles.headerBgVideo} rounded-t-sm" style="color: {themeStyles.cursorColor}">
			<button onclick={onClose} class="press text-xs text-white/50 hover:text-white cursor-pointer font-normal transition-colors">[ Esc ]</button>
		</BoxHeader>

		<div class="p-3 sm:p-4 space-y-4 text-xs sm:text-sm max-h-[75vh] overflow-y-auto custom-scrollbar">
			<p class="text-white/45 text-[11px]">Scope: krsz.in only — the site you are on right now.</p>

			<section class="space-y-1.5">
				<h2 class="text-[11px] sm:text-xs font-black tracking-wide" style="color: {themeStyles.cursorColor}">1. WHAT THIS SITE COLLECTS</h2>
				<p class="text-white/70 leading-relaxed">
					Nothing. krsz.in has no account system, no analytics, and no tracking of any kind. Your
					theme, sound settings, console history and everything else this workbench remembers is
					written only to this browser's own local storage — it never leaves your device, and no
					server ever sees it.
				</p>
			</section>

			<section class="border border-[#e06c75]/40 bg-[#e06c75]/10 rounded-xs p-2.5 space-y-1.5">
				<h2 class="text-[11px] sm:text-xs font-black tracking-wide text-[#e06c75]">2. THE ONE EXCEPTION — GUESTBOOK</h2>
				<p class="text-[#e06c75]/90 leading-relaxed">
					A message posted in the Guestbook is sent to this site's server and displayed publicly.
					That form carries its own confirmation next to the send button, separate from this notice.
				</p>
			</section>

			<section class="space-y-1.5">
				<h2 class="text-[11px] sm:text-xs font-black tracking-wide" style="color: {themeStyles.cursorColor}">3. LINKED PROJECTS — SEPARATE POLICIES</h2>
				<p class="text-white/70 leading-relaxed">
					MODULES links out to other, independently run sites under krsz.in — each is its own
					application with its own server and its own privacy practices, not covered by this notice:
				</p>
				<div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] pt-0.5">
					{#each MODULE_LINKS as m (m.name)}
						<a href={m.href} target="_blank" rel="noopener noreferrer" class="text-white/50 hover:text-white underline transition-colors">{m.name}</a>
					{/each}
				</div>
			</section>

			<div class="border-t border-white/10 pt-2 text-[10px] text-white/30">krsz.in — privacy notice</div>
		</div>
	</div>
</div>
