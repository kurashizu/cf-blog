<script lang="ts">
	import { browser } from '$app/environment';
	import { textSize } from '../../stores/text-scale';

	let { chart, accent = '#56b6c2' }: { chart: string; accent?: string } = $props();

	let container: HTMLDivElement | undefined = $state();
	let renderError = $state<string | null>(null);

	let renderId = 0;

	async function renderChart(source: string, color: string) {
		if (!browser || !container) return;
		const myId = ++renderId;

		try {
			const mermaid = (await import('mermaid')).default;
			mermaid.initialize({
				startOnLoad: false,
				securityLevel: 'strict',
				theme: 'base',
				// Same face as the rest of the site. Mermaid takes its font as a
				// config string rather than inheriting from CSS, so this is its own
				// copy of the stack and had to be updated with it.
				fontFamily: "'Jelly Pixel', 'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
				themeVariables: {
					// Baked into the SVG at draw time -- mermaid cannot inherit the
					// site's rem scale, so the root size is read here and the diagram
					// is redrawn when it changes.
					fontSize: `${parseFloat(getComputedStyle(document.documentElement).fontSize) || 14}px`,
					background: 'transparent',
					primaryColor: 'rgba(255,255,255,0.06)',
					primaryTextColor: '#eceff4',
					primaryBorderColor: color,
					lineColor: 'rgba(255,255,255,0.45)',
					secondaryColor: 'rgba(255,255,255,0.04)',
					tertiaryColor: 'rgba(255,255,255,0.04)',
					edgeLabelBackground: '#16171d',
					clusterBkg: 'rgba(255,255,255,0.03)',
					clusterBorder: 'rgba(255,255,255,0.15)',
					/* Sequence-diagram "Note over/left/right" boxes default to a
					   solid pale yellow under theme: 'base' if left unset -- the
					   one part of the palette above didn't reach, and it's the
					   only opaque, off-style block in an otherwise transparent,
					   dark diagram. */
					noteBkgColor: 'rgba(255,255,255,0.06)',
					noteBorderColor: color,
					noteTextColor: '#eceff4'
				},
				flowchart: {
					useMaxWidth: false,
					htmlLabels: true,
					curve: 'basis',
					padding: 10,
					nodeSpacing: 32,
					rankSpacing: 42
				},
				sequence: {
					useMaxWidth: false,
					actorFontSize: 13,
					actorFontFamily: "'JetBrains Mono', monospace",
					messageFontSize: 13,
					messageFontFamily: "'JetBrains Mono', monospace",
					noteFontSize: 12,
					noteFontFamily: "'JetBrains Mono', monospace",
					wrap: true,
					width: 140,
					height: 40,
					boxMargin: 8,
					messageMargin: 24
				}
			});

			const id = `mermaid-${myId}-${Math.random().toString(36).slice(2, 9)}`;
			const { svg } = await mermaid.render(id, source);

			// A newer render may have started while this one was in flight — drop the stale result.
			if (myId !== renderId || !container) return;
			container.innerHTML = svg;
			renderError = null;
		} catch (err) {
			if (myId !== renderId) return;
			renderError = err instanceof Error ? err.message : 'Diagram failed to render';
		}
	}

	$effect(() => {
		// The text size is a dependency, not an argument: the size is baked into
		// the SVG, so a change means this has to be drawn again from source.
		void $textSize;
		renderChart(chart, accent);
	});
</script>

<div class="overflow-x-auto custom-scrollbar py-1">
	{#if renderError}
		<div class="text-xs text-[#e06c75] font-mono">Diagram error: {renderError}</div>
	{/if}
	<div bind:this={container} class="mermaid-container inline-block min-w-full"></div>
</div>

<style>
	.mermaid-container :global(svg) {
		max-width: none;
	}
</style>
