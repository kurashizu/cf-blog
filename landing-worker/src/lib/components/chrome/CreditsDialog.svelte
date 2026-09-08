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
	import { Dialog } from '$lib/components/ui';
	import { t } from '$lib/i18n';
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
	   flat dump of package names. Titles/descriptions resolve through $t() in
	   the $derived below, not here, since the locale isn't known at module
	   load time. */
	let GROUPS: Group[] = $derived([
		{
			title: $t('chrome.credits.groupFramework'),
			colour: '#98c379',
			items: [
				{ name: 'Svelte', url: 'https://github.com/sveltejs/svelte', licence: 'MIT', what: $t('chrome.credits.svelte') },
				{ name: 'SvelteKit', url: 'https://github.com/sveltejs/kit', licence: 'MIT', what: $t('chrome.credits.sveltekit') },
				{ name: 'Vite', url: 'https://github.com/vitejs/vite', licence: 'MIT', what: $t('chrome.credits.vite') },
				{ name: 'Tailwind CSS', url: 'https://github.com/tailwindlabs/tailwindcss', licence: 'MIT', what: $t('chrome.credits.tailwind') },
				{ name: 'Wrangler', url: 'https://github.com/cloudflare/workers-sdk', licence: 'MIT / Apache-2.0', what: $t('chrome.credits.wrangler') },
				{ name: 'TypeScript', url: 'https://github.com/microsoft/TypeScript', licence: 'Apache-2.0', what: $t('chrome.credits.typescript') }
			]
		},
		{
			title: $t('chrome.credits.groupTypeface'),
			colour: '#e5c07b',
			items: [
				{ name: 'Jelly Pixel Font', url: 'https://github.com/TakWolf/jelly-pixel-font', licence: 'SIL OFL 1.1', what: $t('chrome.credits.jellyPixel') },
				{ name: 'Fusion Pixel Font', url: 'https://github.com/TakWolf/fusion-pixel-font', licence: 'SIL OFL 1.1', what: $t('chrome.credits.fusionPixel') }
			]
		},
		{
			title: $t('chrome.credits.groupUtils'),
			colour: '#61afef',
			items: [
				{ name: '@cloudflare/speedtest', url: 'https://github.com/cloudflare/speedtest', licence: 'MIT', what: $t('chrome.credits.cfSpeedtest') }
			]
		},
		{
			title: 'LM.SPACE',
			colour: '#61afef',
			items: [
				{ name: 'three.js', url: 'https://github.com/mrdoob/three.js', licence: 'MIT', what: $t('chrome.credits.threejs') },
				{ name: 'Artificial Analysis', url: 'https://artificialanalysis.ai', licence: 'Data source', what: $t('chrome.credits.artificialAnalysis') }
			]
		},
		{
			title: 'KRSZ-VM',
			colour: '#c678dd',
			items: [
				{ name: 'v86', url: 'https://github.com/copy/v86', licence: 'BSD-2-Clause', what: $t('chrome.credits.v86') },
				{ name: 'SeaBIOS', url: 'https://github.com/coreboot/seabios', licence: 'LGPLv3', what: $t('chrome.credits.seabios') },
				{ name: 'xterm.js', url: 'https://github.com/xtermjs/xterm.js', licence: 'MIT', what: $t('chrome.credits.xtermjs') },
				{ name: 'xterm-pty', url: 'https://github.com/mame/xterm-pty', licence: 'MIT', what: $t('chrome.credits.xtermPty') }
			]
		},
		{
			title: 'WEB-LM',
			colour: '#56b6c2',
			items: [
				{ name: 'wllama', url: 'https://github.com/ngxson/wllama', licence: 'MIT', what: $t('chrome.credits.wllama') },
				{ name: 'llama.cpp', url: 'https://github.com/ggml-org/llama.cpp', licence: 'MIT', what: $t('chrome.credits.llamacpp') }
			]
		},
		{
			title: $t('chrome.credits.groupContent'),
			colour: '#e06c75',
			items: [
				{ name: 'KaTeX', url: 'https://github.com/KaTeX/KaTeX', licence: 'MIT', what: $t('chrome.credits.katex') },
				{ name: 'Mermaid', url: 'https://github.com/mermaid-js/mermaid', licence: 'MIT', what: $t('chrome.credits.mermaid') }
			]
		},
		{
			title: $t('chrome.credits.groupPalettes'),
			colour: '#d19a66',
			items: [
				{ name: 'Nord', url: 'https://github.com/nordtheme/nord', licence: 'MIT', what: $t('chrome.credits.nord') },
				{ name: 'Gruvbox', url: 'https://github.com/morhetz/gruvbox', licence: 'MIT', what: $t('chrome.credits.gruvbox') }
			]
		},
		{
			title: $t('chrome.credits.groupInfrastructure'),
			colour: '#98c379',
			items: [
				{ name: 'Cloudflare Workers', url: 'https://developers.cloudflare.com/workers/', licence: 'Platform', what: $t('chrome.credits.cloudflareWorkers') }
			]
		}
	]);

</script>

<Dialog title="CREDITS // OPEN_SOURCE" short="CREDITS" label={$t('a11y.dialog.credits')} {onClose} solid>
	<p class="text-xs text-white/50 leading-relaxed">
		{$t('chrome.credits.intro')}
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
					<span class="text-xs text-white/50 shrink-0">{c.licence}</span>
					<span class="text-xs text-white/55 basis-full sm:basis-auto">{c.what}</span>
				</div>
			{/each}
		</div>
	{/each}

	<p class="text-xs text-white/50 leading-relaxed border-t border-white/10 pt-2.5">
		{$t('chrome.credits.outro')}
	</p>
</Dialog>
