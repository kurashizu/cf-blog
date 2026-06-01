/**
 * HTML to Markdown converter — regex-based, no external deps
 */

export interface HtmlToMdResult {
  title: string;
  content: string;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_: string, code: string) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_: string, code: string) => String.fromCharCode(parseInt(code, 16)));
}

function getTextContent(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripDangerous(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s*on\w+="[^"]*"/gi, '')
    .replace(/\s*on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '');
}

function convertToMarkdown(html: string): string {
  let md = html;

  // Headings
  md = md.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, (_: string, t: string) => `\n\n# ${getTextContent(t).trim()}\n\n`);
  md = md.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, (_: string, t: string) => `\n\n## ${getTextContent(t).trim()}\n\n`);
  md = md.replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, (_: string, t: string) => `\n\n### ${getTextContent(t).trim()}\n\n`);
  md = md.replace(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi, (_: string, t: string) => `\n\n#### ${getTextContent(t).trim()}\n\n`);
  md = md.replace(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi, (_: string, t: string) => `\n\n##### ${getTextContent(t).trim()}\n\n`);
  md = md.replace(/<h6\b[^>]*>([\s\S]*?)<\/h6>/gi, (_: string, t: string) => `\n\n###### ${getTextContent(t).trim()}\n\n`);

  // Paragraphs and blocks
  md = md.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_: string, t: string) => `\n\n${getTextContent(t).trim()}\n\n`);
  md = md.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_: string, t: string) => `\n> ${getTextContent(t).trim().replace(/\n/g, '\n> ')}\n\n`);
  md = md.replace(/<hr\s*\/?>/gi, '\n\n---\n\n');

  // Inline elements
  md = md.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_: string, href: string, text: string) => {
    const label = getTextContent(text).trim();
    const safeHref = href.startsWith('http://') || href.startsWith('https://') ? href : '';
    return safeHref ? `[${label}](${safeHref})` : label;
  });
  md = md.replace(/<img\b[^>]*src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'][^>]*)?\/?>/gi, (_: string, src: string, alt: string) => {
    const safeSrc = src.startsWith('http://') || src.startsWith('https://') ? src : '';
    const altText = alt || '';
    return safeSrc ? `![${altText}](${safeSrc})` : '';
  });
  md = md.replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b\b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em\b[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i\b[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
  md = md.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  md = md.replace(/<kbd\b[^>]*>([\s\S]*?)<\/kbd>/gi, '`$1`');
  md = md.replace(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi, '`$1`');
  md = md.replace(/<del\b[^>]*>([\s\S]*?)<\/del>/gi, '~~$1~~');
  md = md.replace(/<ins\b[^>]*>([\s\S]*?)<\/ins>/gi, '__$1__');
  md = md.replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, '$1');
  md = md.replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, '$1');
  md = md.replace(/<br\s*\/?>/gi, '  \n');

  // Code blocks
  md = md.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_: string, code: string) => {
    const inner = code.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '$1');
    return `\n\`\`\`\n${getTextContent(inner).trim()}\n\`\`\`\n`;
  });

  // Lists
  md = md.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_: string, items: string) => {
    const result = items.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_2: string, item: string) => `- ${getTextContent(item).trim()}\n`);
    return result;
  });
  md = md.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_: string, items: string) => {
    let idx = 1;
    const result = items.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_2: string, item: string) => {
      const line = `${idx++}. ${getTextContent(item).trim()}\n`;
      return line;
    });
    return result;
  });

  // Tables
  md = md.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_: string, table: string) => {
    const rows: string[][] = [];
    const headerMatches = table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i);
    if (headerMatches) {
      const headers: string[] = [];
      headerMatches[1].replace(/<th\b[^>]*>([\s\S]*?)<\/th>/gi, (_2: string, h: string) => { headers.push(getTextContent(h).trim()); return ''; });
      rows.push(headers);
      rows.push(headers.map(() => '---'));
    }
    const tbodyMatch = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
    if (tbodyMatch) {
      tbodyMatch[1].replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (_2: string, row: string) => {
        const cells: string[] = [];
        row.replace(/<td\b[^>]*>([\s\S]*?)<\/td>/gi, (_3: string, c: string) => { cells.push(getTextContent(c).trim()); return ''; });
        rows.push(cells);
        return '';
      });
    }
    if (rows.length === 0) return '';
    const colCount = Math.max(...rows.map(r => r.length));
    return '\n' + rows.map(row => {
      while (row.length < colCount) row.push('');
      return '| ' + row.join(' | ') + ' |';
    }).join('\n') + '\n\n';
  });

  // Remove remaining tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode entities
  md = decodeHtmlEntities(md);

  // Clean up
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return md;
}

export function htmlToMarkdown(html: string): HtmlToMdResult {
  let title = '';

  // Extract title
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = decodeHtmlEntities(getTextContent(titleMatch[1])).trim();
  }

  // Also check og:title
  const ogTitleMatch = html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                       html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (ogTitleMatch) {
    title = decodeHtmlEntities(ogTitleMatch[1]).trim();
  }

  // Strip dangerous elements
  const clean = stripDangerous(html);

  // Convert to markdown
  const content = convertToMarkdown(clean);

  return { title: title.trim(), content };
}
