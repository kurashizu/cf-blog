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
 * A small syntax highlighter for fenced code.
 *
 * Not a parser — a single pass of ordered patterns, which is all a chat reply
 * needs and cannot get stuck on malformed input. The order matters: comments
 * and strings are claimed first so a keyword inside them is not recoloured.
 *
 * Everything is escaped on the way in, and the patterns only ever wrap already
 * escaped text in spans, so highlighting cannot introduce markup.
 */
const TOKENS: [RegExp, string][] = [
	// Comments and strings first — they win over everything inside them.
	[/(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)/g, 'c'],
	[/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|`[^`]*?`)/g, 's'],
	// Numbers, including hex and decimals.
	[/\b(0x[0-9a-fA-F]+|\d+\.?\d*)\b/g, 'n'],
	[
		/\b(const|let|var|function|return|if|else|for|while|class|new|await|async|import|export|from|def|elif|try|catch|except|finally|throw|raise|with|as|in|of|not|and|or|is|None|True|False|null|undefined|true|false|this|self|typeof|instanceof|break|continue|yield|lambda|pass)\b/g,
		'k'
	],
	// A name immediately before a paren reads as a call.
	[/\b([a-zA-Z_$][\w$]*)(?=\()/g, 'f']
];

function highlight(code: string, lang: string): string {
	const escaped = escapeHtml(code);
	// Plain text and prose fences are left alone; colour would only mislead.
	if (lang && /^(text|txt|plain|md|markdown|output)$/i.test(lang)) return escaped;

	// Placeholders keep an earlier match from being re-scanned by a later
	// pattern, which is what would let a keyword inside a string get recoloured.
	const held: string[] = [];
	let out = escaped;
	for (const [re, cls] of TOKENS) {
		out = out.replace(re, (m) => {
			held.push(`<span class="tok-${cls}">${m}</span>`);
			// The index is written in letters, not digits: a numeric placeholder
			// is itself matched by the number pattern on the next pass, which ate
			// the comment and string it was standing in for.
			const tag = String(held.length - 1)
				.split('')
				.map((d) => String.fromCharCode(97 + Number(d)))
				.join('');
			return `\u0000${tag}\u0000`;
		});
	}
	return out.replace(/\u0000([a-j]+)\u0000/g, (_, tag: string) =>
		held[
			Number(
				tag
					.split('')
					.map((ch) => ch.charCodeAt(0) - 97)
					.join('')
			)
		]
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
			out.push(`<pre${lang}><code>${highlight(body.join('\n'), fence[1] ?? '')}</code></pre>`);
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

/**
 * True when the tail of a reply has collapsed into repetition.
 *
 * Sampling penalties make looping less likely but cannot rule it out, and a
 * model stuck in a loop will happily fill every token it is allowed. This
 * watches the end of the stream for a short phrase repeating back-to-back, so
 * generation can be cut off rather than run to max_tokens.
 *
 * Deliberately conservative: it needs three consecutive copies of a chunk of
 * real length, which prose does not produce by accident.
 */
export function isLooping(text: string): boolean {
	// Long enough to hold three copies of a paragraph-sized repeat.
	const tail = text.slice(-1800);
	if (tail.length < 60) return false;

	// Every phrase length, longest first — a stride would step over the exact
	// period of a repeat and miss it. Capped at a third of the tail, since three
	// copies have to fit.
	const max = Math.floor(tail.length / 3);
	for (let len = Math.min(400, max); len >= 8; len--) {
		const a = tail.slice(-len);
		const b = tail.slice(-len * 2, -len);
		if (a !== b) continue;
		const c = tail.slice(-len * 3, -len * 2);
		if (b === c && a.trim().length >= 8) return true;
	}
	return false;
}

export interface SplitReply {
	/** Reasoning the model emitted in its thinking channel. */
	think: string;
	/** Everything outside that channel — the actual answer. */
	answer: string;
	/** True while a reasoning block is open and not yet closed. */
	thinking: boolean;
}

/**
 * The delimiters a reply may wrap its reasoning in. This model's template emits
 * `<|channel>thought\n` … `\n<channel|>`, where `thought` names the channel and
 * is part of the marker rather than the reasoning — so the open tag is matched
 * with a pattern that consumes the channel name, otherwise it shows up as a
 * stray first line in the reasoning box. `<think>` is kept because other models
 * emit that instead, and a stray pair would otherwise render as part of the
 * answer.
 */
const THINK_DELIMS: [RegExp, string][] = [
	// The channel's name ("thought") is decoded as ordinary text right after the
	// marker, so it is consumed here rather than showing up as the block's first
	// line.
	[/<\|channel>[ \t]*[a-z_]*\n?/, '<channel|>'],
	[/<think>/, '</think>']
];

/** Separates the reasoning block from the answer. */
export function splitThink(raw: string): SplitReply {
	for (const [openRe, closeTag] of THINK_DELIMS) {
		const m = raw.match(openRe);
		if (!m || m.index === undefined) continue;

		const open = m.index;
		const bodyStart = open + m[0].length;
		const close = raw.indexOf(closeTag, bodyStart);
		if (close === -1) {
			// Still streaming the reasoning.
			return { think: raw.slice(bodyStart), answer: '', thinking: true };
		}
		const think = raw.slice(bodyStart, close);
		const answer = (raw.slice(0, open) + raw.slice(close + closeTag.length)).trim();
		return { think: think.trim(), answer, thinking: false };
	}
	return { think: '', answer: raw, thinking: false };
}
