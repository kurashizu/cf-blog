<script lang="ts">
	import { Menu, MenuItem } from '$lib/components/ui';
	import { playSound } from '$lib/sound';
	import { LOCALES, locale, localeAuto, setLocale, detectLocale, t, type Locale } from '$lib/i18n';
	import PixelIcon from '../pixel/PixelIcon.svelte';

	/* The footer's language picker: the same list-with-a-dot menu the synth's
	   LOAD and the workbench Dropdown use, opening upward from the corner. The
	   footer clips its overflow, so the list is portalled to <body> and pinned
	   to the trigger with fixed coordinates, like WaveMenu. */
	let open = $state(false);
	let trigger = $state<HTMLButtonElement | null>(null);
	let anchor = $state({ right: 0, bottom: 0 });

	let current = $derived(LOCALES.find((l) => l.id === $locale) ?? LOCALES[0]);
	let detected = $derived(LOCALES.find((l) => l.id === detectLocale()) ?? LOCALES[0]);

	function toggle() {
		open = !open;
		if (open && trigger) {
			const r = trigger.getBoundingClientRect();
			anchor = { right: window.innerWidth - r.right, bottom: window.innerHeight - r.top + 4 };
		}
		playSound('click');
	}

	function close() {
		open = false;
		trigger?.focus({ preventScroll: true });
	}

	function pick(id: Locale | 'auto') {
		setLocale(id);
		playSound('click');
		close();
	}
</script>

<button
	bind:this={trigger}
	onclick={toggle}
	title={$t('common.lang.title')}
	data-tour="lang"
	aria-label={$t('a11y.menu.language')}
	aria-haspopup="menu"
	aria-expanded={open}
	class="press flex items-center cursor-pointer transition-colors shrink-0 {open ? 'text-white' : 'text-white/60 hover:text-white/70'}"
>
	<PixelIcon name="globe" size={16} />
	<!-- The current language's one-glyph badge beside the globe (简 / 繁 / 日 / 한 / EN). -->
	<span class="ml-1 text-xs leading-none" lang={$locale}>{current.code}</span>
</button>

{#if open}
	<Menu
		onClose={close}
		portal
		backdropZ={120}
		label={$t('a11y.menu.language')}
		class="origin-bottom-right fixed z-[130] min-w-[190px]"
		style="right: {anchor.right}px; bottom: {anchor.bottom}px"
	>
		<div class="px-2.5 pt-0.5 pb-1 text-[10px] font-bold text-white/60 select-none border-b border-white/10 mb-1" aria-hidden="true">{$t('common.lang.menu')}</div>
		<MenuItem checked={$localeAuto} note={$t('common.lang.autoNote', { name: detected.native })} onclick={() => pick('auto')}>
			{$t('common.lang.auto')}
		</MenuItem>
		<div class="border-t border-white/10 my-1" role="separator"></div>
		{#each LOCALES as l (l.id)}
			<MenuItem checked={!$localeAuto && $locale === l.id} note={l.code} lang={l.id} onclick={() => pick(l.id)}>
				{l.native}
			</MenuItem>
		{/each}
	</Menu>
{/if}
