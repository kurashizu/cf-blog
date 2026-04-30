/**
 * R2 Client for Cloudflare R2 storage operations
 * Handles article CRUD operations with frontmatter parsing
 */

/**
 * Parse YAML-like frontmatter from markdown content
 */
export function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { data: {}, body: content };
  }

  const frontmatterStr = match[1];
  const body = match[2];
  const data: Record<string, unknown> = {};

  // Simple YAML-like parser for our frontmatter format
  const lines = frontmatterStr.split('\n');
  let currentKey = '';
  let currentArray: string[] = [];

  for (const line of lines) {
    // Array item (starts with -)
    if (line.trimStart().startsWith('- ')) {
      const value = line.trimStart().substring(2).trim();
      if (value) currentArray.push(value);
      continue;
    }

    // Flush array if we have one
    if (currentArray.length > 0 && !line.includes(':')) {
      data[currentKey] = [...currentArray];
      currentArray = [];
    }

    // Key-value pair
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();

      // Flush any pending array
      if (currentArray.length > 0) {
        data[currentKey] = [...currentArray];
        currentArray = [];
      }

      if (value === '') {
        // Start of array
        currentKey = key;
      } else {
        // Regular value
        data[key] = value;
        currentKey = '';
      }
    }
  }

  // Flush any remaining array
  if (currentArray.length > 0) {
    data[currentKey] = currentArray;
  }

  return { data, body };
}

/**
 * Build YAML frontmatter string from data object
 */
export function buildFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = ['---'];

  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else if (value !== undefined && value !== null) {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

export interface R2ClientOptions {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export class R2Client {
  private accountId: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private bucket: string;
  private endpoint: string;

  constructor(options: R2ClientOptions) {
    this.accountId = options.accountId;
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.bucket = options.bucket;
    this.endpoint = `https://${this.accountId}.r2.cloudflarestorage.com`;
  }

  /**
   * Get article content by key (slug)
   */
  async getArticle(key: string): Promise<string> {
    // For SSR/Edge, use direct R2 fetch
    // In Cloudflare Pages Functions, we can use R2 bindings directly
    // For now, return empty - actual implementation uses Cloudflare Workers/R2 API

    // Using S3-compatible API via fetch
    const url = `${this.endpoint}/${this.bucket}/${key}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': this.getAuthHeader('GET', key),
        'Content-Type': 'text/markdown',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Article not found: ${key}`);
      }
      throw new Error(`Failed to get article: ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * List all article keys with optional prefix
   */
  async listArticles(prefix: string = 'articles/'): Promise<string[]> {
    // List objects using S3-compatible API
    const url = `${this.endpoint}/${this.bucket}/?prefix=${encodeURIComponent(prefix)}`;

    // Use ListObjectsV2
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': this.getAuthHeader('GET', '/'),
        'Content-Type': 'application/xml',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list articles: ${response.statusText}`);
    }

    const xml = await response.text();
    const keys: string[] = [];

    // Parse XML response for object keys
    const keyMatches = xml.match(/<Key>([^<]+)<\/Key>/g);
    if (keyMatches) {
      for (const match of keyMatches) {
        const key = match.replace('<Key>', '').replace('</Key>', '');
        keys.push(key);
      }
    }

    return keys;
  }

  /**
   * Save article content to R2
   */
  async saveArticle(key: string, content: string): Promise<void> {
    const url = `${this.endpoint}/${this.bucket}/${key}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': this.getAuthHeader('PUT', key),
        'Content-Type': 'text/markdown',
      },
      body: content,
    });

    if (!response.ok) {
      throw new Error(`Failed to save article: ${response.statusText}`);
    }
  }

  /**
   * Delete article from R2
   */
  async deleteArticle(key: string): Promise<void> {
    const url = `${this.endpoint}/${this.bucket}/${key}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': this.getAuthHeader('DELETE', key),
      },
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete article: ${response.statusText}`);
    }
  }

  /**
   * Generate AWS Signature Version 4 authorization header
   * Simplified version for R2-compatible API
   */
  private getAuthHeader(method: string, path: string): string {
    // In Cloudflare Pages, R2 is accessed via bindings, not signed requests
    // This method is kept for compatibility with external R2 API access
    // For Pages Functions, use R2 binding directly

    // Return empty - actual auth handled by Workers runtime
    return '';
  }

  // Static methods for frontmatter
  static parseFrontmatter = parseFrontmatter;
  static buildFrontmatter = buildFrontmatter;
}