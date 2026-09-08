import { describe, it, expect } from 'vitest';
import { renderMarkdown, isLooping } from '../../src/lib/components/chatbot/markdown';

/* This renderer takes untrusted model output, so the escaping tests below are
   the point of the file, not an afterthought. */

describe('HTML escaping', () => {
	it('escapes tags rather than emitting them', () => {
		const out = renderMarkdown('<script>alert(1)</script>');
		expect(out).not.toMatch(/<script/i);
		expect(out).toContain('&lt;script&gt;');
	});

	it('escapes an img onerror payload', () => {
		const out = renderMarkdown('<img src=x onerror=alert(1)>');
		expect(out).not.toMatch(/<img/i);
		expect(out).toContain('&lt;img');
	});

	it('escapes quotes and ampersands', () => {
		const out = renderMarkdown(`a & b "c" 'd'`);
		expect(out).toContain('&amp;');
		expect(out).toContain('&quot;');
		expect(out).toContain('&#39;');
	});

	it('escapes HTML inside a fenced code block', () => {
		const out = renderMarkdown('```\n<b>bold</b>\n```');
		expect(out).not.toMatch(/<b>bold<\/b>/);
		expect(out).toContain('&lt;b&gt;');
	});

	it('escapes HTML inside inline code', () => {
		const out = renderMarkdown('use `<div>` here');
		expect(out).toContain('&lt;div&gt;');
		expect(out).not.toMatch(/<div>/);
	});
});

describe('link safety', () => {
	it('renders an http(s) link', () => {
		const out = renderMarkdown('[site](https://krsz.in)');
		expect(out).toContain('href="https://krsz.in"');
		expect(out).toContain('rel="noopener noreferrer"');
		expect(out).toContain('target="_blank"');
	});

	it.each([
		['javascript', '[x](javascript:alert(1))'],
		['data', '[x](data:text/html,<script>alert(1)</script>)'],
		['vbscript', '[x](vbscript:msgbox(1))'],
		['file', '[x](file:///etc/passwd)']
	])('refuses to build an anchor for a %s URL', (_label, src) => {
		const out = renderMarkdown(src);
		expect(out).not.toMatch(/<a\s/i);
	});
});

describe('block elements', () => {
	it('renders headings', () => {
		expect(renderMarkdown('# Title')).toMatch(/<h1[^>]*>Title<\/h1>/);
		expect(renderMarkdown('## Sub')).toMatch(/<h2[^>]*>Sub<\/h2>/);
	});

	it('renders a fenced code block, syntax-highlighted', () => {
		const out = renderMarkdown('```js\nconst a = 1;\n```');
		expect(out).toMatch(/<pre[^>]*>/);
		expect(out).toContain('data-lang="js"');
		// the source is present, split into highlight spans
		expect(out.replace(/<[^>]+>/g, '')).toContain('const a = 1;');
	});

	it('renders an unordered list', () => {
		const out = renderMarkdown('- one\n- two');
		expect(out).toContain('<ul>');
		expect(out).toContain('one');
		expect(out).toContain('two');
	});

	it('renders an ordered list', () => {
		const out = renderMarkdown('1. first\n2. second');
		expect(out).toContain('<ol>');
		expect(out).toContain('first');
	});

	it('renders a blockquote', () => {
		expect(renderMarkdown('> quoted')).toContain('<blockquote>');
	});
});

describe('inline spans', () => {
	it('renders bold and italic', () => {
		expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
		expect(renderMarkdown('*italic*')).toContain('<em>italic</em>');
	});

	it('renders inline code', () => {
		expect(renderMarkdown('`code`')).toContain('<code>code</code>');
	});

	it('does not apply emphasis inside inline code', () => {
		const out = renderMarkdown('`**not bold**`');
		expect(out).not.toContain('<strong>');
		expect(out).toContain('<code>**not bold**</code>');
	});

	it('does not build a link inside inline code', () => {
		const out = renderMarkdown('`[text](https://example.com)`');
		expect(out).not.toMatch(/<a\s/i);
		expect(out).toContain('<code>[text](https://example.com)</code>');
	});

	it('still renders emphasis outside the code span', () => {
		const out = renderMarkdown('**bold** and `code` and *italic*');
		expect(out).toContain('<strong>bold</strong>');
		expect(out).toContain('<code>code</code>');
		expect(out).toContain('<em>italic</em>');
	});

	it('leaves text that merely looks like the placeholder alone', () => {
		const out = renderMarkdown('CODE0 and `real`');
		expect(out).toContain('<code>real</code>');
		expect(out).toContain('CODE0');
	});

	it('renders several code spans on one line', () => {
		const out = renderMarkdown('`one` then `two` then `three`');
		expect(out).toContain('<code>one</code>');
		expect(out).toContain('<code>two</code>');
		expect(out).toContain('<code>three</code>');
	});

	it('does not leave a NUL marker behind in the output', () => {
		const out = renderMarkdown('`a` **b** `c`');
		expect(out).not.toContain('\u0000');
	});
});

describe('tables', () => {
	const table = ['| a | b |', '| --- | --- |', '| 1 | 2 |'].join('\n');

	it('renders a header row and a body row', () => {
		const out = renderMarkdown(table);
		expect(out).toContain('<table>');
		expect(out).toContain('<th>a</th>');
		expect(out).toContain('<th>b</th>');
		expect(out).toContain('<td>1</td>');
		expect(out).toContain('<td>2</td>');
	});

	it('wraps the table so the scroll lives on a container', () => {
		expect(renderMarkdown(table)).toContain('<div class="tbl">');
	});

	it('renders several body rows', () => {
		const out = renderMarkdown([table, '| 3 | 4 |'].join('\n'));
		expect(out).toContain('<td>3</td>');
		expect(out).toContain('<td>4</td>');
	});

	it('accepts an alignment row written with colons', () => {
		const out = renderMarkdown(['| a | b |', '| :--- | ---: |', '| 1 | 2 |'].join('\n'));
		expect(out).toContain('<table>');
		expect(out).toContain('<td>1</td>');
	});

	it('treats a lone row of pipes as prose, not a table', () => {
		const out = renderMarkdown('a | b | c');
		expect(out).not.toContain('<table>');
	});

	it('turns a <br> inside a cell into a real line break', () => {
		const out = renderMarkdown(['| a |', '| --- |', '| one<br>two |'].join('\n'));
		expect(out).toContain('<br>');
		expect(out).not.toContain('&lt;br&gt;');
	});

	it('still escapes other HTML inside a cell', () => {
		const out = renderMarkdown(['| a |', '| --- |', '| <img src=x onerror=1> |'].join('\n'));
		expect(out).not.toMatch(/<img/i);
		expect(out).toContain('&lt;img');
	});

	it('renders inline markup inside a cell', () => {
		const out = renderMarkdown(['| a |', '| --- |', '| **bold** |'].join('\n'));
		expect(out).toContain('<strong>bold</strong>');
	});

	it('tolerates rows without the outer pipes', () => {
		const out = renderMarkdown(['a | b', '--- | ---', '1 | 2'].join('\n'));
		expect(out).toContain('<th>a</th>');
		expect(out).toContain('<td>2</td>');
	});
});

describe('syntax highlighting', () => {
	/** The text of a rendered block, with the highlight spans stripped. */
	const plain = (html: string) => html.replace(/<[^>]+>/g, '');
	/** Which token classes a rendered block used. */
	const classes = (html: string) => [...html.matchAll(/tok-([a-z])/g)].map((m) => m[1]);

	it('marks keywords, numbers, strings, comments and calls', () => {
		const out = renderMarkdown('```js\nconst n = 0x1f; // note\nfoo("s");\n```');
		const seen = new Set(classes(out));
		expect(seen).toContain('k'); // const
		expect(seen).toContain('n'); // 0x1f
		expect(seen).toContain('c'); // // note
		expect(seen).toContain('s'); // "s"
		expect(seen).toContain('f'); // foo(
	});

	it('leaves the source readable once the spans are stripped', () => {
		const src = 'const a = 1;\nreturn foo(a);';
		const out = renderMarkdown('```js\n' + src + '\n```');
		expect(plain(out)).toBe(src);
	});

	it('does not recolour a keyword inside a string', () => {
		// the placeholder pass exists for exactly this
		const out = renderMarkdown('```js\nconst s = "return if for";\n```');
		const stringSpan = out.match(/<span class="tok-s">([^<]*)<\/span>/)?.[1] ?? '';
		expect(stringSpan).toContain('return if for');
		expect(stringSpan).not.toContain('tok-k');
	});

	it('does not recolour a keyword inside a comment', () => {
		const out = renderMarkdown('```js\n// return if for\n```');
		const commentSpan = out.match(/<span class="tok-c">([^<]*)<\/span>/)?.[1] ?? '';
		expect(commentSpan).toContain('return if for');
		expect(out.match(/tok-k/)).toBeNull();
	});

	it('survives more than ten held tokens, where the index needs two letters', () => {
		// indices are written in letters, not digits, so a placeholder is not
		// itself matched by the number pattern on a later pass
		const src = Array.from({ length: 15 }, (_, i) => 'const x' + i + ' = ' + i + ';').join('\n');
		const out = renderMarkdown('```js\n' + src + '\n```');
		expect(plain(out)).toBe(src);
		expect(out).not.toContain('\u0000');
	});

	it('leaves no placeholder in the output for any input', () => {
		for (const src of ['a', '// c', '"s"', '1 2 3', 'f(1)', 'const x = "1" // 2']) {
			const out = renderMarkdown('```js\n' + src + '\n```');
			expect(out).not.toContain('\u0000');
		}
	});

	it('leaves prose fences uncoloured', () => {
		for (const lang of ['text', 'txt', 'plain', 'md', 'markdown', 'output']) {
			const out = renderMarkdown('```' + lang + '\nconst return 1\n```');
			expect(out).not.toContain('tok-');
		}
	});

	it('matches the prose languages case-insensitively', () => {
		expect(renderMarkdown('```TEXT\nconst x\n```')).not.toContain('tok-');
	});

	it('still highlights a fence with no language', () => {
		// no language named is not the same as "prose"
		expect(renderMarkdown('```\nconst x = 1;\n```')).toContain('tok-');
	});

	it('escapes the language before putting it in an attribute', () => {
		// only a bare word reaches data-lang, so the escaping is belt-and-braces
		// rather than the thing standing between a reply and an attribute break
		const out = renderMarkdown('```js\ncode\n```');
		expect(out).toContain('data-lang="js"');
		expect(out).not.toMatch(/data-lang="[^"]*"[^>]*=/);
	});

	it('highlights decimals and hex but not a bare word', () => {
		const out = renderMarkdown('```js\n1.5 0xff word\n```');
		expect(out).toContain('>1.5<');
		expect(out).toContain('>0xff<');
		expect(plain(out)).toContain('word');
	});
});

describe('mermaid blocks', () => {
	it('hands a closed diagram to the page rather than rendering it', () => {
		const out = renderMarkdown('```mermaid\ngraph TD;\nA-->B;\n```');
		expect(out).toContain('data-mermaid=');
		expect(out).not.toContain('<pre');
	});

	it('keeps the source escaped inside the attribute', () => {
		const out = renderMarkdown('```mermaid\nA["<b>"]-->B;\n```');
		expect(out).not.toContain('<b>');
		expect(out).toContain('&lt;b&gt;');
	});

	it('shows an unclosed diagram as code, not as a diagram', () => {
		// half a diagram is not a diagram, and mermaid is loud about it
		const out = renderMarkdown('```mermaid\ngraph TD;');
		expect(out).not.toContain('data-mermaid=');
		expect(out).toContain('data-lang="mermaid"');
	});
});

describe('paragraphs and block boundaries', () => {
	it('joins consecutive lines into one paragraph', () => {
		const out = renderMarkdown('one\ntwo');
		expect(out.match(/<p>/g)?.length).toBe(1);
	});

	it('splits paragraphs on a blank line', () => {
		const out = renderMarkdown('one\n\ntwo');
		expect(out.match(/<p>/g)?.length).toBe(2);
	});

	it.each([
		['a fence', '```'],
		['a heading', '# h'],
		['a quote', '> q'],
		['a bullet', '- b'],
		['a numbered item', '1. n'],
		['a paren-numbered item', '1) n']
	])('ends a paragraph at %s', (_label, starter) => {
		const out = renderMarkdown('text\n' + starter);
		expect(out).toMatch(/<p>text<\/p>/);
	});

	it('ends a paragraph at a table header', () => {
		const out = renderMarkdown('text\n| a |\n| --- |\n| 1 |');
		expect(out).toMatch(/<p>text<\/p>/);
		expect(out).toContain('<table>');
	});

	it('keeps a lone pipe line inside the paragraph', () => {
		// it only ends the paragraph when an alignment row follows
		const out = renderMarkdown('text\na | b');
		expect(out).not.toContain('<table>');
		expect(out.match(/<p>/g)?.length).toBe(1);
	});

	it('closes an open list before a new block', () => {
		const out = renderMarkdown('- a\n# heading');
		expect(out.indexOf('</ul>')).toBeLessThan(out.indexOf('<h1'));
	});

	it('closes an open list at the end of the input', () => {
		expect(renderMarkdown('- a\n- b')).toContain('</ul>');
	});

	it('switches between list kinds rather than nesting them', () => {
		const out = renderMarkdown('- a\n1. b');
		expect(out).toContain('</ul>');
		expect(out).toContain('<ol>');
	});
});

describe('lines no block claims', () => {
	/* A fence whose info string is not a bare word does not match the fence
	   pattern (`\w+`), and the paragraph loop refuses to absorb anything
	   starting with three backticks. Nothing consumed the line, so the index
	   never advanced and renderMarkdown spun until the tab ran out of memory.
	   Model replies are untrusted input, so this was a hang anyone could
	   trigger. */

	it.each([
		['a quoted info string', '```js"onload="x'],
		['a dotted info string', '```a.b'],
		['a hyphenated info string', '```c-lang'],
		['punctuation only', '```!!!'],
		['a space in the info string', '```js extra']
	])('renders %s as text instead of hanging', (_label, src) => {
		const out = renderMarkdown(src);
		expect(out).toContain('```');
		// one paragraph, not thousands
		expect(out.match(/<p>/g)?.length ?? 0).toBeLessThanOrEqual(1);
	});

	it('keeps rendering the lines after one', () => {
		const out = renderMarkdown('```js"x\nafter');
		expect(out).toContain('after');
	});

	it('escapes such a line rather than emitting it', () => {
		const out = renderMarkdown('```<script>alert(1)</script>');
		expect(out).not.toMatch(/<script/i);
		expect(out).toContain('&lt;script&gt;');
	});

	it('finishes promptly for a reply full of them', () => {
		const src = Array.from({ length: 200 }, () => '```js"x').join('\n');
		const started = Date.now();
		const out = renderMarkdown(src);
		expect(Date.now() - started).toBeLessThan(1000);
		expect(out.length).toBeLessThan(200_000);
	});
});

describe('edge cases', () => {
	it('renders empty input without throwing', () => {
		expect(() => renderMarkdown('')).not.toThrow();
	});

	it('handles an unterminated code fence', () => {
		expect(() => renderMarkdown('```js\nconst a = 1;')).not.toThrow();
	});

	it('leaves plain text intact', () => {
		expect(renderMarkdown('just words')).toContain('just words');
	});
});

describe('isLooping', () => {
	it('is false for ordinary prose', () => {
		expect(isLooping('The quick brown fox jumps over the lazy dog, and then it rests.')).toBe(false);
	});

	it('is false for short text', () => {
		expect(isLooping('hi')).toBe(false);
	});

	it('detects a phrase repeated many times', () => {
		expect(isLooping('I am sorry. '.repeat(40))).toBe(true);
	});

	it('detects a single character repeated many times', () => {
		expect(isLooping('a'.repeat(500))).toBe(true);
	});
});
