/**
 * A deliberately small Markdown renderer for model replies.
 *
 * Everything the model emits is untrusted text, so this escapes HTML first and
 * only then introduces the tags it means to produce. Nothing here ever passes
 * model output through as markup. It covers what a chat reply actually uses —
 * fenced code, inline code, headings, lists, quotes, bold/italic, links — and
 * deliberately not the rest of the spec.
 */

const ESC: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Inline spans, applied to already-escaped text. */
function inline(s: string): string {
	return (
		s
			// `code` first: its content must not pick up emphasis markup.
			.replace(/`([^`\n]+)`/g, '<code>$1</code>')
			.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
			.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
			// Only http(s) links, so no javascript: or data: URLs can be built.
			.replace(
				/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
				'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
			)
	);
}

/**
 * Renders Markdown to an HTML string. The input is escaped before any tag is
 * added, so a reply containing markup renders as visible text.
 */
export function renderMarkdown(src: string): string {
	const out: string[] = [];
	const lines = src.split('\n');
	let i = 0;
	let listKind: 'ul' | 'ol' | null = null;

	const closeList = () => {
		if (listKind) {
			out.push(`</${listKind}>`);
			listKind = null;
		}
	};

	while (i < lines.length) {
		const line = lines[i];

		// Fenced code — consumed verbatim, never parsed for inline markup.
		const fence = line.match(/^\s*```(\w+)?\s*$/);
		if (fence) {
			closeList();
			const lang = fence[1] ? ` data-lang="${escapeHtml(fence[1])}"` : '';
			const body: string[] = [];
			i++;
			while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
				body.push(lines[i]);
				i++;
			}
			i++; // closing fence (or end of input)
			out.push(`<pre${lang}><code>${escapeHtml(body.join('\n'))}</code></pre>`);
			continue;
		}

		if (!line.trim()) {
			closeList();
			i++;
			continue;
		}

		const heading = line.match(/^(#{1,4})\s+(.*)$/);
		if (heading) {
			closeList();
			const level = heading[1].length;
			out.push(`<h${level}>${inline(escapeHtml(heading[2]))}</h${level}>`);
			i++;
			continue;
		}

		const quote = line.match(/^>\s?(.*)$/);
		if (quote) {
			closeList();
			out.push(`<blockquote>${inline(escapeHtml(quote[1]))}</blockquote>`);
			i++;
			continue;
		}

		const ul = line.match(/^\s*[-*+]\s+(.*)$/);
		const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
		if (ul || ol) {
			const kind = ul ? 'ul' : 'ol';
			if (listKind !== kind) {
				closeList();
				out.push(`<${kind}>`);
				listKind = kind;
			}
			out.push(`<li>${inline(escapeHtml((ul ?? ol)![1]))}</li>`);
			i++;
			continue;
		}

		// Paragraph: gather until a blank line or a block-level construct.
		closeList();
		const para: string[] = [];
		while (
			i < lines.length &&
			lines[i].trim() &&
			!/^\s*```/.test(lines[i]) &&
			!/^#{1,4}\s/.test(lines[i]) &&
			!/^>/.test(lines[i]) &&
			!/^\s*[-*+]\s/.test(lines[i]) &&
			!/^\s*\d+[.)]\s/.test(lines[i])
		) {
			para.push(lines[i]);
			i++;
		}
		out.push(`<p>${inline(escapeHtml(para.join('\n'))).replace(/\n/g, '<br>')}</p>`);
	}

	closeList();
	return out.join('');
}

export interface SplitReply {
	/** Reasoning the model emitted inside <think> … </think>. */
	think: string;
	/** Everything outside the think block — the actual answer. */
	answer: string;
	/** True while a think block is open and not yet closed. */
	thinking: boolean;
}

/**
 * Separates the reasoning block from the answer. `<think>` and `</think>` are
 * real tokens in this model's vocabulary, so they arrive as literal text in the
 * stream and would otherwise render as part of the reply.
 */
export function splitThink(raw: string): SplitReply {
	const open = raw.indexOf('<think>');
	if (open === -1) return { think: '', answer: raw, thinking: false };

	const close = raw.indexOf('</think>', open);
	if (close === -1) {
		// Still streaming the reasoning.
		return { think: raw.slice(open + 7), answer: '', thinking: true };
	}
	const think = raw.slice(open + 7, close);
	const answer = (raw.slice(0, open) + raw.slice(close + 8)).trim();
	return { think: think.trim(), answer, thinking: false };
}
