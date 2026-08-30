<script lang="ts">
	/**
	 * A model reply, with its maths and diagrams rendered.
	 *
	 * renderMarkdown() returns HTML plus two things it deliberately does not
	 * finish: maths spans, which it lifts out as markers, and mermaid fences,
	 * which it leaves as empty elements carrying their source. Both need a
	 * library this page should not load unless a reply actually contains one, so
	 * they are completed here after the HTML is in the DOM.
	 */
	import { renderMarkdown, type MathSpan } from './markdown';

	let { content }: { content: string } = $props();

	let host: HTMLDivElement | undefined = $state();

	/** The marker renderMarkdown leaves where a maths span was. */
	const MATH_MARK = '\u0001';

	/**
	 * The HTML and the maths it refers to are derived together.
	 *
	 * Assigning the spans to separate `$state` from inside the derivation is
	 * what Svelte calls an unsafe mutation, and it does not merely warn: it
	 * throws mid-update, which aborts whatever render was in flight. Here that
	 * meant the chatbot's own `phase = 'ready'` never reached the DOM, so the
	 * page sat on the loading screen after the model had finished loading.
	 */
	let rendered = $derived.by(() => {
		const math: MathSpan[] = [];
		const html = renderMarkdown(content, math);
		return { html, math };
	});
	let html = $derived(rendered.html);
	let math = $derived(rendered.math);

	/**
	 * Replaces the markers with rendered maths.
	 *
	 * KaTeX is imported only when a span exists — it is ~280 KB, and most replies
	 * have none. A span that fails to parse is shown as its own source rather
	 * than throwing: half-written LaTeX is common mid-stream, and a reply should
	 * not disappear because of it.
	 */
	async function renderMath(el: HTMLElement, spans: MathSpan[]) {
		if (!spans.length) return;
		// The stylesheet is part of the renderer, not decoration: without it
		// KaTeX's markup collapses into unreadable overlapping glyphs. Imported
		// alongside the library so both arrive only when maths does.
		const [katex] = await Promise.all([
			import('katex').then((m) => m.default),
			import('katex/dist/katex.min.css')
		]);

		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		const hits: Text[] = [];
		while (walker.nextNode()) {
			const t = walker.currentNode as Text;
			if (t.data.includes(MATH_MARK)) hits.push(t);
		}

		for (const node of hits) {
			const frag = document.createDocumentFragment();
			const parts = node.data.split(new RegExp(MATH_MARK + '(\\d+)' + MATH_MARK));
			parts.forEach((part, i) => {
				// Odd positions are the captured indices; even ones are literal text.
				if (i % 2 === 0) {
					if (part) frag.appendChild(document.createTextNode(part));
					return;
				}
				const span = spans[Number(part)];
				if (!span) return;
				const holder = document.createElement(span.display ? 'div' : 'span');
				if (span.display) holder.className = 'katex-block';
				try {
					katex.render(span.tex, holder, {
						displayMode: span.display,
						throwOnError: false,
						// The model writes for a chat, not a paper; unknown macros
						// should read as themselves rather than turn the reply red.
						errorColor: '#e06c75',
						strict: false
					});
				} catch {
					holder.textContent = span.tex;
				}
				frag.appendChild(holder);
			});
			node.replaceWith(frag);
		}
	}

	/** Draws any mermaid fences the reply contained. */
	async function renderDiagrams(el: HTMLElement) {
		const blocks = [...el.querySelectorAll<HTMLElement>('[data-mermaid]')].filter(
			(n) => !n.dataset.done
		);
		if (!blocks.length) return;
		const mermaid = (await import('mermaid')).default;
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'strict',
			theme: 'base',
			fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
			themeVariables: {
				fontSize: '13px',
				background: 'transparent',
				primaryColor: 'rgba(255,255,255,0.06)',
				primaryTextColor: '#eceff4',
				primaryBorderColor: '#56b6c2',
				lineColor: 'rgba(255,255,255,0.45)',
				secondaryColor: 'rgba(255,255,255,0.04)',
				tertiaryColor: 'rgba(255,255,255,0.04)',
				edgeLabelBackground: '#16171d'
			},
			flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' }
		});

		for (const block of blocks) {
			const src = block.dataset.mermaid ?? '';
			// Marked before rendering so a re-run mid-stream does not draw it twice.
			block.dataset.done = '1';
			try {
				const id = `m${Math.random().toString(36).slice(2, 9)}`;
				const { svg } = await mermaid.render(id, src);
				block.innerHTML = svg;
				block.className = 'overflow-x-auto py-1';
			} catch (err) {
				// A diagram the model got wrong should read as the code it wrote,
				// not vanish.
				block.className = 'text-xs font-mono text-[#e06c75]/80';
				block.textContent = `diagram error: ${(err as Error).message}`;
			}
		}
	}

	$effect(() => {
		// Depend on the html so this re-runs as a reply streams in.
		void html;
		if (!host) return;
		void renderMath(host, math);
		void renderDiagrams(host);
	});
</script>

<div bind:this={host} class="chat-md">{@html html}</div>
