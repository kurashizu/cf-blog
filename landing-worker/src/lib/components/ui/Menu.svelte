<script lang="ts">
	/**
	 * A popup list of choices -- the workbench Dropdown, the footer language
	 * picker and the synth's LOAD / wave / preset menus all draw this. The
	 * caller positions it (`class` / `style`), fills it with MenuItem, and
	 * closes it from `onClose`; this supplies role=menu, the arrow-key
	 * roving (use:menu), a click-outside backdrop, and an optional portal to
	 * <body> for menus that open from inside an overflow-clipped panel.
	 */
	import type { Snippet } from 'svelte';
	import { scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
	import { menu } from '$lib/actions/menu';

	let {
		onClose,
		label,
		color = '#56b6c2',
		portal = false,
		backdrop = true,
		backdropZ = 40,
		class: cls = '',
		style = '',
		children
	}: {
		onClose: () => void;
		label?: string;
		color?: string;
		portal?: boolean;
		backdrop?: boolean;
		backdropZ?: number;
		class?: string;
		style?: string;
		children?: Snippet;
	} = $props();

	function maybePortal(node: HTMLElement) {
		if (!portal) return;
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	/* pointerdown rather than click: a click on the backdrop would otherwise
	   also reach whatever is under it once the backdrop unmounts mid-gesture. */
	function closeOnPointer(node: HTMLElement) {
		const h = (e: PointerEvent) => {
			e.preventDefault();
			onClose();
		};
		node.addEventListener('pointerdown', h);
		return { destroy: () => node.removeEventListener('pointerdown', h) };
	}
</script>

{#if backdrop}
	<div use:maybePortal use:closeOnPointer class="fixed inset-0" style="z-index: {backdropZ}" aria-hidden="true"></div>
{/if}
<div
	use:maybePortal
	use:menu={{ onClose }}
	role="menu"
	aria-label={label}
	class="ui-menu {cls}"
	style="--ui: {color}; {style}"
	transition:scale={{ duration: 140, start: 0.95, opacity: 0, easing: cubicOut }}
>
	{@render children?.()}
</div>
