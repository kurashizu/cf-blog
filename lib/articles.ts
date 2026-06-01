import { marked } from 'marked';
import { parseFrontmatter } from './frontmatter';
import { r2Paths } from './r2-paths';
import { r2Get, r2List, r2Put, r2Delete } from './r2';

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

export type PostListItem = Omit<Post, 'content'>;

export function markdownToHtml(md: string): string {
  const result = marked.parse(md, { gfm: true, breaks: true });
  return typeof result === 'string' ? result : '';
}

function parsePost(slug: string, content: string, key?: string): Post {
  const { data, body } = parseFrontmatter(content);
  const postSlug = key ? r2Paths.extractSlug(key) : slug;
  const tagsValue = data.tags;
  const tags: string[] = Array.isArray(tagsValue)
    ? tagsValue.filter((t): t is string => typeof t === 'string')
    : typeof tagsValue === 'string'
      ? tagsValue.split(',').map(t => t.trim()).filter(Boolean)
      : [];
  return {
    slug: postSlug,
    title: (data.title as string) || '',
    date: (data.date as string) || '',
    description: (data.description as string) || '',
    tags,
    published: data.published !== 'false',
    coverImage: data.coverImage as string | undefined,
    author: (data.author as string) || 'Kurashizu',
    draft: data.draft === 'true',
    content: body,
  };
}

function parsePostMeta(content: string, key: string): PostListItem | null {
  const { data } = parseFrontmatter(content);
  const slug = r2Paths.extractSlug(key);
  const tagsValue = data.tags;
  const tags: string[] = Array.isArray(tagsValue)
    ? tagsValue.filter((t): t is string => typeof t === 'string')
    : typeof tagsValue === 'string'
      ? tagsValue.split(',').map(t => t.trim()).filter(Boolean)
      : [];
  const post = {
    slug,
    title: (data.title as string) || '',
    date: (data.date as string) || '',
    description: (data.description as string) || '',
    tags,
    published: data.published !== 'false',
    coverImage: data.coverImage as string | undefined,
    author: (data.author as string) || 'Kurashizu',
    draft: data.draft === 'true',
  };
  if (post.draft || !post.published) return null;
  return post;
}

export async function buildArticleIndex(): Promise<PostListItem[]> {
  const keys = await r2List(r2Paths.articlesPrefix);
  const posts: PostListItem[] = [];

  for (const key of keys) {
    if (!key.endsWith('.md')) continue;
    try {
      const content = await r2Get(key);
      const meta = parsePostMeta(content, key);
      if (meta) posts.push(meta);
    } catch {
      continue;
    }
  }

  posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  await r2Put(r2Paths.articlesIndexCache, JSON.stringify(posts));
  return posts;
}

export function createArticlesRepo() {
  return {
    async getBySlug(slug: string): Promise<Post | null> {
      try {
        const key = r2Paths.article(slug);
        const content = await r2Get(key);
        return parsePost(slug, content, key);
      } catch {
        return null;
      }
    },

    async getAll(): Promise<PostListItem[]> {
      try {
        const cached = await r2Get(r2Paths.articlesIndexCache);
        if (cached) {
          const parsed = JSON.parse(cached) as PostListItem[];
          if (parsed.length > 0) {
            buildArticleIndex().catch(e => console.error('Background index rebuild failed:', e));
            return parsed;
          }
        }
      } catch {
        // cache miss
      }
      return buildArticleIndex();
    },

    async getRecent(limit: number = 5): Promise<PostListItem[]> {
      const posts = await this.getAll();
      return posts.slice(0, limit);
    },

    async save(slug: string, content: string): Promise<void> {
      const key = r2Paths.article(slug);
      await r2Put(key, content);
      try { await r2Delete(r2Paths.articlesIndexCache); } catch { /* ignore */ }
    },

    async delete(slug: string): Promise<void> {
      const key = r2Paths.article(slug);
      await r2Delete(key);
      try { await r2Delete(r2Paths.articlesIndexCache); } catch { /* ignore */ }
    },
  };
}
