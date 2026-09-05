<script lang="ts">
	/**
	 * What this site is built out of.
	 *
	 * Every entry is something actually shipped or run by this worker, with the
	 * licence it carries -- not a generic thanks list. Several of these licences
	 * (OFL, MIT, BSD, Apache-2.0) require the notice to travel with the work, so
	 * this dialog is where that obligation is met rather than a nicety.
	 *
	 * Styled as the CFG window is, because it is the same kind of thing: a panel
	 * over the terminal, dismissed with Esc or a click outside.
	 */
	import BoxHeader from './BoxHeader.svelte';
	import { fade, scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
	import { resolvedTheme, THEME_STYLES } from '../../stores/theme';
	import { playSound } from '../../sound';

	let { onClose }: { onClose: () => void } = $props();

	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);

	interface Credit {
		name: string;
		url: string;
		licence: string;
		what: string;
	}

	interface Group {
		title: string;
		colour: string;
		items: Credit[];
	}

	/* Grouped by the part of the site each one is responsible for, so the list
	   reads as an explanation of how the thing is put together rather than a
	   flat dump of package names. */
	const GROUPS: Group[] = [
		{
			title: 'FRAMEWORK',
			colour: '#98c379',
			items: [
				{ name: 'Svelte', url: 'https://github.com/sveltejs/svelte', licence: 'MIT', what: 'Every view on this site' },
				{ name: 'SvelteKit', url: 'https://github.com/sveltejs/kit', licence: 'MIT', what: 'Routing, prerendering, the worker build' },
				{ name: 'Vite', url: 'https://github.com/vitejs/vite', licence: 'MIT', what: 'Bundler and dev server' },
				{ name: 'Tailwind CSS', url: 'https://github.com/tailwindlabs/tailwindcss', licence: 'MIT', what: 'The whole visual layer' },
				{ name: 'Wrangler', url: 'https://github.com/cloudflare/workers-sdk', licence: 'MIT / Apache-2.0', what: 'Builds and deploys the Worker' },
				{ name: 'TypeScript', url: 'https://github.com/microsoft/TypeScript', licence: 'Apache-2.0', what: 'Types across the codebase' }
			]
		},
		{
			title: 'TYPEFACE',
			colour: '#e5c07b',
			items: [
				{ name: 'Jelly Pixel Font', url: 'https://github.com/TakWolf/jelly-pixel-font', licence: 'SIL OFL 1.1', what: 'Every glyph you are reading, at 12px' }
			]
		},
		{
			title: 'LM.SPACE',
			colour: '#61afef',
			items: [
				{ name: 'three.js', url: 'https://github.com/mrdoob/three.js', licence: 'MIT', what: 'The model field, rendered in WebGL' },
				{ name: 'Artificial Analysis', url: 'https://artificialanalysis.ai', licence: 'Data source', what: 'Every model coordinate is a field of their payload' }
			]
		},
		{
			title: 'KRSZ-VM',
			colour: '#c678dd',
			items: [
				{ name: 'v86', url: 'https://github.com/copy/v86', licence: 'BSD-2-Clause', what: 'An x86 PC emulated in the tab' },
				{ name: 'SeaBIOS', url: 'https://github.com/coreboot/seabios', licence: 'LGPLv3', what: 'The BIOS that machine boots' },
				{ name: 'xterm.js', url: 'https://github.com/xtermjs/xterm.js', licence: 'MIT', what: 'The serial console' },
				{ name: 'xterm-pty', url: 'https://github.com/mame/xterm-pty', licence: 'MIT', what: 'Line discipline for that console' }
			]
		},
		{
			title: 'CHATBOT',
			colour: '#56b6c2',
			items: [
				{ name: 'wllama', url: 'https://github.com/ngxson/wllama', licence: 'MIT', what: 'Runs a language model in the browser' },
				{ name: 'llama.cpp', url: 'https://github.com/ggml-org/llama.cpp', licence: 'MIT', what: 'The inference engine underneath it' }
			]
		},
		{
			title: 'CONTENT',
			colour: '#e06c75',
			items: [
				{ name: 'KaTeX', url: 'https://github.com/KaTeX/KaTeX', licence: 'MIT', what: 'Maths in chat and articles' },
				{ name: 'Mermaid', url: 'https://github.com/mermaid-js/mermaid', licence: 'MIT', what: 'The architecture diagrams in modules' }
			]
		},
		{
			title: 'PALETTES',
			colour: '#d19a66',
			items: [
				{ name: 'Nord', url: 'https://github.com/nordtheme/nord', licence: 'MIT', what: 'The nord-terminal theme' },
				{ name: 'Gruvbox', url: 'https://github.com/morhetz/gruvbox', licence: 'MIT', what: 'The gruvbox-dark theme' }
			]
		},
		{
			title: 'INFRASTRUCTURE',
			colour: '#98c379',
			items: [
				{ name: 'Cloudflare Workers', url: 'https://developers.cloudflare.com/workers/', licence: 'Platform', what: 'Runs this site, and D1 / R2 / KV / Vectorize behind it' }
			]
		}
	];

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onClose();
		}
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-[160] bg-black/70 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-2 sm:p-6 overflow-y-auto"
	onclick={onClose}
	transition:fade={{ duration: 180 }}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- The panel's own background is set inline rather than through
	     themeStyles.cardBgVideo: that class carries an /82 alpha suffix that
	     Tailwind does not generate (the theme classes are assembled at runtime,
	     so the scanner never sees this variant), leaving the panel fully
	     transparent and the page legible straight through the text. An inline
	     colour cannot be missed by the scanner. -->
	<div
		class="w-full max-w-2xl backdrop-blur-sm border {themeStyles.border} rounded-sm shadow-[0_16px_48px_rgba(0,0,0,0.8)] font-mono my-auto transform-gpu"
		style="background-color: color-mix(in srgb, var(--bg-card) 94%, transparent);"
		onclick={(e) => e.stopPropagation()}
		transition:scale={{ duration: 180, start: 0.96, opacity: 0, easing: cubicOut }}
	>
		<BoxHeader
			title="CREDITS // OPEN_SOURCE"
			short="CREDITS"
			class="text-xs sm:text-sm font-black px-3 py-2 border-b {themeStyles.border} {themeStyles.headerBgVideo} rounded-t-sm"
			style="color: {themeStyles.cursorColor}"
		>
			<button onclick={onClose} class="press text-xs text-white/50 hover:text-white cursor-pointer font-normal transition-colors">[ Esc ]</button>
		</BoxHeader>

		<div class="p-3 sm:p-4 space-y-3 max-h-[80vh] overflow-y-auto custom-scrollbar">
			<p class="text-xs text-white/50 leading-relaxed">
				This site is assembled almost entirely out of other people's work. Everything below is
				something it actually ships or runs, with the licence it carries.
			</p>

			{#each GROUPS as g (g.title)}
				<div class="border border-white/15 rounded-xs bg-black/25 p-2.5 space-y-2">
					<div class="text-xs font-black border-b border-white/10 pb-1" style="color: {g.colour}">{g.title}</div>
					{#each g.items as c (c.name)}
						<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
							<a
								href={c.url}
								target="_blank"
								rel="noopener noreferrer"
								onclick={() => playSound('click')}
								class="press text-xs font-bold underline decoration-white/25 underline-offset-2 hover:decoration-current transition-colors"
								style="color: {g.colour}"
							>{c.name}</a>
							<span class="text-xs text-white/30 shrink-0">{c.licence}</span>
							<span class="text-xs text-white/55 basis-full sm:basis-auto">{c.what}</span>
						</div>
					{/each}
				</div>
			{/each}

			<p class="text-xs text-white/35 leading-relaxed border-t border-white/10 pt-2.5">
				If something here is miscredited or missing, that is a mistake worth telling me about.
			</p>
		</div>
	</div>
</div>
