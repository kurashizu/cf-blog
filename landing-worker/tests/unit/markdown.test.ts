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
