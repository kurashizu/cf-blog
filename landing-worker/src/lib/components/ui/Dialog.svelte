<script lang="ts">
	/**
	 * The site's modal: scrim, panel, "┌─[ TITLE ]─┐" header with an [ Esc ]
	 * button, scrolling body. use:modal gives it role=dialog, focus-in,
	 * Tab trap, Escape, backdrop click, an inert page behind and focus
	 * return -- so a dialog built on this owes nothing further to the
	 * keyboard. `label` is what a reader announces on open; it defaults to
	 * the title, which is usually an ASCII banner, so pass a real name.
	 */
	import type { Snippet } from 'svelte';
	import { fade, scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
	import { t } from '$lib/i18n';
	import { modal } from '$lib/actions/modal';
	import { resolvedTheme, THEME_STYLES } from '$lib/stores/theme';
	import BoxHeader from '../chrome/BoxHeader.svelte';
	import Button from './Button.svelte';

	let {
		title,
		short,
		label,
		onClose,
		size = 'lg',
		z = 160,
		closeOnBackdrop = true,
		bodyClass = 'p-3 sm:p-4 space-y-3 max-h-[80vh] overflow-y-auto custom-scrollbar',
		panelClass = '',
		solid = false,
		children,
		headerRight
	}: {
		title: string;
		short?: string | string[];
		label?: string;
		onClose: () => void;
		size?: 'md' | 'lg' | 'xl';
		z?: number;
		closeOnBackdrop?: boolean;
		bodyClass?: string;
		panelClass?: string;
		/** Opaque panel (credits) instead of the theme's translucent card. */
		solid?: boolean;
		children?: Snippet;
		headerRight?: Snippet;
	} = $props();

	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);
	const titleId = $props.id();
	const WIDTH = { md: 'max-w-xl', lg: 'max-w-2xl', xl: 'max-w-3xl' } as const;
</script>

<div
	class="ui-scrim"
	style="z-index: {z}"
	use:modal={{ onClose, closeOnBackdrop, labelledBy: label ? undefined : titleId, label }}
	transition:fade={{ duration: 180 }}
>
	<div
		class="ui-dialog {WIDTH[size]} border {themeStyles.border} {solid ? 'backdrop-blur-sm' : themeStyles.cardBgVideo} {panelClass}"
		style={solid ? 'background-color: color-mix(in srgb, var(--bg-card) 94%, transparent);' : undefined}
		transition:scale={{ duration: 180, start: 0.96, opacity: 0, easing: cubicOut }}
	>
		<BoxHeader
			{title}
			{short}
			class="text-xs sm:text-sm font-black px-3 py-2 border-b {themeStyles.border} {themeStyles.headerBgVideo} rounded-t-sm"
			style="color: {themeStyles.cursorColor}"
		>
			<span id={titleId} class="sr-only">{label ?? title}</span>
			{@render headerRight?.()}
			<Button variant="ghost" size="xs" label={$t('a11y.dialog.close')} onclick={onClose} class="font-normal">[ Esc ]</Button>
		</BoxHeader>
		<div class={bodyClass}>
			{@render children?.()}
		</div>
	</div>
</div>
