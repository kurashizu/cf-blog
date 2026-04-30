import { describe, it, expect } from 'vitest';
import { markdownToHtml } from './posts';

describe('markdown to HTML conversion', () => {
  describe('markdownToHtml', () => {
    it('should convert basic markdown to HTML', () => {
      const md = '# Hello World';
      const result = markdownToHtml(md);

      expect(result).toContain('<h1>Hello World</h1>');
    });

    it('should convert paragraphs', () => {
      const md = 'This is a paragraph.\n\nThis is another paragraph.';
      const result = markdownToHtml(md);

      expect(result).toContain('<p>');
      expect(result).toContain('This is a paragraph.');
    });

    it('should convert bold text', () => {
      const md = 'This is **bold** text';
      const result = markdownToHtml(md);

      expect(result).toContain('<strong>bold</strong>');
    });

    it('should convert italic text', () => {
      const md = 'This is *italic* text';
      const result = markdownToHtml(md);

      expect(result).toContain('<em>italic</em>');
    });

    it('should convert inline code', () => {
      const md = 'Use the `code` function';
      const result = markdownToHtml(md);

      expect(result).toContain('<code>code</code>');
    });

    it('should convert code blocks', () => {
      const md = '```javascript\nconst x = 1;\n```';
      const result = markdownToHtml(md);

      expect(result).toContain('<code');
      expect(result).toContain('javascript');
    });

    it('should convert links', () => {
      const md = '[Click here](https://example.com)';
      const result = markdownToHtml(md);

      expect(result).toContain('<a href="https://example.com"');
      expect(result).toContain('Click here</a>');
    });

    it('should convert images', () => {
      const md = '![Alt text](/image.jpg)';
      const result = markdownToHtml(md);

      expect(result).toContain('<img src="/image.jpg" alt="Alt text"');
    });

    it('should convert unordered lists', () => {
      const md = '- Item 1\n- Item 2\n- Item 3';
      const result = markdownToHtml(md);

      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Item 1</li>');
      expect(result).toContain('<li>Item 2</li>');
    });

    it('should convert ordered lists', () => {
      const md = '1. First\n2. Second\n3. Third';
      const result = markdownToHtml(md);

      expect(result).toContain('<ol>');
      expect(result).toContain('<li>First</li>');
    });

    it('should convert blockquotes', () => {
      const md = '> This is a quote';
      const result = markdownToHtml(md);

      expect(result).toContain('<blockquote>');
      expect(result).toContain('This is a quote');
    });

    it('should convert horizontal rules', () => {
      const md = 'Some text\n\n---\n\nMore text';
      const result = markdownToHtml(md);

      expect(result).toContain('<hr');
    });

    it('should convert headings of all levels', () => {
      expect(markdownToHtml('# H1')).toContain('<h1>');
      expect(markdownToHtml('## H2')).toContain('<h2>');
      expect(markdownToHtml('### H3')).toContain('<h3>');
      expect(markdownToHtml('#### H4')).toContain('<h4>');
      expect(markdownToHtml('##### H5')).toContain('<h5>');
      expect(markdownToHtml('###### H6')).toContain('<h6>');
    });

    it('should handle empty string', () => {
      const md = '';
      const result = markdownToHtml(md);

      expect(result).toBe('');
    });

    it('should handle complex markdown document', () => {
      const md = `# Blog Post Title

This is an introduction paragraph with **bold** and *italic* text.

## Section 1

- List item 1
- List item 2

\`\`\`javascript
const greeting = "Hello World";
console.log(greeting);
\`\`\`

> Important note here

[Link to resource](https://example.com)
`;

      const result = markdownToHtml(md);

      expect(result).toContain('<h1>');
      expect(result).toContain('<h2>');
      expect(result).toContain('<strong>');
      expect(result).toContain('<em>');
      expect(result).toContain('<ul>');
      expect(result).toContain('<code');
      expect(result).toContain('<blockquote>');
      expect(result).toContain('<a href=');
    });

    it('should handle line breaks', () => {
      const md = 'Line 1\nLine 2\nLine 3';
      const result = markdownToHtml(md);

      // With breaks: true, newlines become <br> tags
      expect(result).toContain('<br');
    });

    it('should support GitHub Flavored Markdown features', () => {
      // Tables
      const md = '| Header |\n| ------ |\n| Cell |';
      const result = markdownToHtml(md);

      expect(result).toContain('<table>');
      expect(result).toContain('<th>Header</th>');
      expect(result).toContain('<td>Cell</td>');

      // Task lists
      const taskMd = '- [x] Done\n- [ ] Todo';
      const taskResult = markdownToHtml(taskMd);

      expect(taskResult).toContain('<input');
    });
  });
});
