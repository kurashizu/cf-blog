<script lang="ts">
	import { Dialog } from '$lib/components/ui';
	import { t } from '$lib/i18n';
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

<Dialog
	title="PRIVACY_NOTICE // KRSZ.IN"
	short="PRIVACY"
	label={$t('a11y.dialog.privacy')}
	{onClose}
	size="md"
	z={195}
	bodyClass="p-3 sm:p-4 space-y-4 text-xs sm:text-sm max-h-[75vh] overflow-y-auto custom-scrollbar"
>
	<p class="text-white/60 text-[11px]">{$t('chrome.privacy.scope')}</p>

	<section class="space-y-1.5">
		<h2 class="text-[11px] sm:text-xs font-black tracking-wide" style="color: {themeStyles.cursorColor}">{$t('chrome.privacy.section1Title')}</h2>
		<p class="text-white/70 leading-relaxed">{$t('chrome.privacy.section1Body')}</p>
	</section>

	<section class="border border-[#e06c75]/40 bg-[#e06c75]/10 rounded-xs p-2.5 space-y-1.5">
		<h2 class="text-[11px] sm:text-xs font-black tracking-wide text-[#e06c75]">{$t('chrome.privacy.section2Title')}</h2>
		<p class="text-[#e06c75]/90 leading-relaxed">{$t('chrome.privacy.section2Intro')}</p>
		<ul class="space-y-1 pl-3 text-[#e06c75]/90 leading-relaxed list-['·_']">
			<li>{$t('chrome.privacy.section2Guestbook')}</li>
			<li>{$t('chrome.privacy.section2Footprint')}</li>
			<li>{$t('chrome.privacy.section2Speed')}</li>
			<li>{$t('chrome.privacy.section2Dig')}</li>
		</ul>
	</section>

	<section class="space-y-1.5">
		<h2 class="text-[11px] sm:text-xs font-black tracking-wide" style="color: {themeStyles.cursorColor}">{$t('chrome.privacy.section3Title')}</h2>
		<p class="text-white/70 leading-relaxed">{$t('chrome.privacy.section3Body')}</p>
		<div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] pt-0.5">
			{#each MODULE_LINKS as m (m.name)}
				<a href={m.href} target="_blank" rel="noopener noreferrer" class="text-white/50 hover:text-white underline transition-colors">{m.name}</a>
			{/each}
		</div>
	</section>

	<div class="border-t border-white/10 pt-2 text-[10px] text-white/50">{$t('chrome.privacy.footer')}</div>
</Dialog>
