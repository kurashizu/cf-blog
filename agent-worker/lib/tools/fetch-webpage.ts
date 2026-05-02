/**
 * fetch_webpage tool — fetch URL and convert HTML to Markdown
 */
import { htmlToMarkdown } from '@/lib/html-to-md';

const MAX_SIZE = 500 * 1024; // 500KB

export const fetchWebpageTool = {
  name: 'fetch_webpage',
  description: 'Fetch a URL and convert the HTML content to clean Markdown format',
  example: '{"url": "https://example.com"}',

  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to fetch (http or https only)',
      },
    },
    required: ['url'],
  },

  execute: async (args: Record<string, unknown>) => {
    const url = args.url as string;

    if (typeof url !== 'string') {
      return { success: false, error: 'url must be a string' };
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { success: false, error: 'Only http/https URLs allowed' };
    }

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': 'cf-agent/1.0' },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      return { success: false, error: 'Fetch failed' };
    }

    const contentType = res.headers.get('content-type') || '';
    const isHtml = !contentType.includes('json');

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }

    let text: string;
    try {
      text = await res.text();
    } catch {
      return { success: false, error: 'Failed to read response' };
    }

    if (text.length > MAX_SIZE) {
      text = text.slice(0, MAX_SIZE);
    }

    if (isHtml) {
      const { title, content } = htmlToMarkdown(text);
      return {
        success: true,
        title,
        content,
        type: 'markdown',
        status: res.status,
      };
    }

    return {
      success: true,
      content: text.slice(0, 1000),
      type: 'text',
      status: res.status,
    };
  },
};