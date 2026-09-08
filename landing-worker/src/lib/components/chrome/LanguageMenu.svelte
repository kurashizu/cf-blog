<script lang="ts">
	import { scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
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

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	function toggle() {
		open = !open;
		if (open && trigger) {
			const r = trigger.getBoundingClientRect();
			anchor = { right: window.innerWidth - r.right, bottom: window.innerHeight - r.top + 4 };
		}
		playSound('click');
	}

	function pick(id: Locale | 'auto') {
		setLocale(id);
		playSound('click');
		open = false;
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.stopPropagation();
			open = false;
		}
	}

	const row = 'press w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-3 cursor-pointer transition-colors';
</script>

<svelte:window onkeydown={onWindowKeydown} />

<button
	bind:this={trigger}
	onclick={toggle}
	title={$t('common.lang.title')}
	data-tour="lang"
	aria-label={$t('common.lang.menu')}
	class="press flex items-center cursor-pointer transition-colors shrink-0 {open ? 'text-white' : 'text-white/40 hover:text-white/70'}"
>
	<PixelIcon name="globe" size={16} />
	<!-- The current language's one-glyph badge beside the globe (简 / 繁 / 日 / 한 / EN). -->
	<span class="ml-1 text-xs leading-none" lang={$locale}>{current.code}</span>
</button>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div use:portal class="fixed inset-0 z-[120]" onclick={() => (open = false)}></div>

	<div
		use:portal
		style="right: {anchor.right}px; bottom: {anchor.bottom}px"
		class="origin-bottom-right fixed z-[130] min-w-[190px] bg-[#121417] border border-[#56b6c2]/50 rounded-xs shadow-[0_8px_24px_rgba(0,0,0,0.7)] py-1 text-xs font-mono"
		transition:scale={{ duration: 140, start: 0.95, opacity: 0, easing: cubicOut }}
	>
		<div class="px-2.5 pt-0.5 pb-1 text-[10px] font-bold text-white/40 select-none border-b border-white/10 mb-1">{$t('common.lang.menu')}</div>
		<button onclick={() => pick('auto')} class="{row} {$localeAuto ? 'text-white bg-white/10 font-bold' : 'text-white/80 hover:bg-white/10'}">
			<span class="flex items-center gap-2 min-w-0">
				<span class="shrink-0 {$localeAuto ? 'text-[#98c379]' : 'text-white/25'}">{$localeAuto ? '●' : '○'}</span>
				<span class="truncate">{$t('common.lang.auto')}</span>
			</span>
			<span class="shrink-0 text-[10px] text-white/40">{$t('common.lang.autoNote', { name: detected.native })}</span>
		</button>
		<div class="border-t border-white/10 my-1"></div>
		{#each LOCALES as l (l.id)}
			{@const on = !$localeAuto && $locale === l.id}
			<button onclick={() => pick(l.id)} class="{row} {on ? 'text-white bg-white/10 font-bold' : 'text-white/80 hover:bg-white/10'}" lang={l.id}>
				<span class="flex items-center gap-2 min-w-0">
					<span class="shrink-0 {on ? 'text-[#98c379]' : 'text-white/25'}">{on ? '●' : '○'}</span>
					<span class="truncate">{l.native}</span>
				</span>
				<span class="shrink-0 text-[10px] text-white/40">{l.code}</span>
			</button>
		{/each}
	</div>
{/if}
