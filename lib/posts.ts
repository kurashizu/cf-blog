import { marked } from 'marked';
import { R2Client, parseFrontmatter } from './r2';

// Types
export interface Post {
  slug: string;
  title: string;
  date: string;
  description: string;
  tags: string[];
  published: boolean;
  coverImage?: string;
  author: string;
  draft: boolean;
  content: string;
}

// Lazy-initialized R2 client
let r2Client: R2Client | null = null;

/**
 * Initialize R2 client with environment variables
 */
export function initializeR2Client(): R2Client {
  if (r2Client) {
    return r2Client;
  }

  const accountId = process.env.R2_ACCOUNT_ID || '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
  const bucket = process.env.R2_BUCKET || 'articles';

  r2Client = new R2Client({ accountId, accessKeyId, secretAccessKey, bucket });
  return r2Client;
}

/**
 * Get a single post by slug
 */
export async function getPostBySlug(slug: string): Promise<Post | null> {
  try {
    const client = initializeR2Client();
    const key = `articles/${slug}.md`;
    const content = await client.getArticle(key);
    const { data, body } = parseFrontmatter(content);

    return {
      slug,
      title: (data.title as string) || '',
      date: (data.date as string) || '',
      description: (data.description as string) || '',
      tags: (data.tags as string[]) || [],
      published: data.published !== 'false',
      coverImage: data.coverImage as string | undefined,
      author: (data.author as string) || 'Kurashizu',
      draft: data.draft === 'true',
      content: body,
    };
  } catch (error) {
    // Article not found
    return null;
  }
}

/**
 * Get all published posts sorted by date (newest first)
 */
export async function getAllPosts(): Promise<Post[]> {
  try {
    const client = initializeR2Client();
    const keys = await client.listArticles('articles/');

    const posts: Post[] = [];

    for (const key of keys) {
      if (!key.endsWith('.md')) continue;

      try {
        const content = await client.getArticle(key);
        const { data, body } = parseFrontmatter(content);

        // Skip drafts unless explicitly needed
        if (data.draft === 'true') continue;

        const slug = key.replace('articles/', '').replace('.md', '');
        posts.push({
          slug,
          title: (data.title as string) || '',
          date: (data.date as string) || '',
          description: (data.description as string) || '',
          tags: (data.tags as string[]) || [],
          published: data.published !== 'false',
          coverImage: data.coverImage as string | undefined,
          author: (data.author as string) || 'Kurashizu',
          draft: data.draft === 'true',
          content: body,
        });
      } catch {
        // Skip malformed articles
        continue;
      }
    }

    // Sort by date, newest first
    return posts.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });
  } catch (error) {
    console.error('Failed to get all posts:', error);
    return [];
  }
}

/**
 * Get recent posts with optional limit
 */
export async function getRecentPosts(limit: number = 5): Promise<Post[]> {
  const allPosts = await getAllPosts();
  return allPosts.slice(0, limit);
}

/**
 * Convert markdown to HTML using marked library
 */
export function markdownToHtml(md: string): string {
  const result = marked.parse(md, {
    gfm: true,
    breaks: true,
  });

  return typeof result === 'string' ? result : '';
}