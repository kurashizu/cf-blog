<script lang="ts">
	/* The accessibility menu in the footer, beside the language picker: the
	   universal-access figure opens the switches that matter most to
	   assistive-tech and keyboard users -- reduce motion, single-key
	   shortcuts, text size -- without a trip through Global Settings, which
	   it also links to. Same portalled, upward-opening Menu as the language
	   picker so the two read as one cluster. */
	import { Menu, MenuItem } from '$lib/components/ui';
	import { playSound } from '$lib/sound';
	import { t } from '$lib/i18n';
	import PixelIcon from '../pixel/PixelIcon.svelte';
	import { reduceMotion, setReduceMotion, singleKeyHotkeys, setSingleKeyHotkeys, announce } from '$lib/stores/a11y';
	import { textSize, textSizeAuto, setTextSize, setTextSizeAuto, autoTextSize, physicalScreenWidth, TEXT_SIZES } from '$lib/stores/text-scale';
	import { hotkeyOverlayOpen, globalSettingsOpen } from '$lib/stores/chrome';

	let open = $state(false);
	let trigger = $state<HTMLButtonElement | null>(null);
	let anchor = $state({ right: 0, bottom: 0 });

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

	function flip(name: string, on: boolean, set: (v: boolean) => void) {
		set(on);
		playSound('toggle');
		announce($t(on ? 'a11y.announce.on' : 'a11y.announce.off', { name }));
	}
</script>

<button
	bind:this={trigger}
	onclick={toggle}
	title={$t('a11y.settings.title')}
	aria-label={$t('a11y.menu.open')}
	aria-haspopup="menu"
	aria-expanded={open}
	class="press flex items-center cursor-pointer transition-colors shrink-0 {open ? 'text-white' : 'text-white/50 hover:text-white/70'}"
>
	<PixelIcon name="access" size={16} />
</button>

{#if open}
	<Menu
		onClose={close}
		portal
		backdropZ={120}
		label={$t('a11y.menu.open')}
		class="origin-bottom-right fixed z-[130] min-w-[210px]"
		style="right: {anchor.right}px; bottom: {anchor.bottom}px"
	>
		<div class="px-2.5 pt-0.5 pb-1 text-[10px] font-bold text-white/50 select-none border-b border-white/10 mb-1" aria-hidden="true">{$t('a11y.menu.title')}</div>
		<MenuItem kind="checkbox" checked={$reduceMotion} onclick={() => flip($t('a11y.settings.reduceMotion'), !$reduceMotion, setReduceMotion)}>
			{$t('a11y.settings.reduceMotion')}
		</MenuItem>
		<MenuItem kind="checkbox" checked={$singleKeyHotkeys} onclick={() => flip($t('a11y.settings.singleKey'), !$singleKeyHotkeys, setSingleKeyHotkeys)}>
			{$t('a11y.settings.singleKey')}
		</MenuItem>
		<div class="border-t border-white/10 my-1" role="separator"></div>
		<div class="px-2.5 pb-0.5 text-[10px] font-bold text-white/50 select-none" aria-hidden="true">{$t('a11y.menu.textSize')}</div>
		<MenuItem checked={$textSizeAuto} note="{autoTextSize(physicalScreenWidth())}px" color="#e5c07b" onclick={() => { setTextSizeAuto(); playSound('click'); }}>
			{$t('common.lang.auto')}
		</MenuItem>
		{#each TEXT_SIZES as px (px)}
			<MenuItem checked={!$textSizeAuto && $textSize === px} color="#e5c07b" onclick={() => { setTextSize(px); playSound('click'); }}>
				{px}px
			</MenuItem>
		{/each}
		<div class="border-t border-white/10 my-1" role="separator"></div>
		<MenuItem onclick={() => { close(); hotkeyOverlayOpen.set(true); playSound('click'); }}>{$t('a11y.menu.keymap')}</MenuItem>
		<MenuItem onclick={() => { close(); globalSettingsOpen.set(true); playSound('click'); }}>{$t('a11y.menu.allSettings')}</MenuItem>
	</Menu>
{/if}
