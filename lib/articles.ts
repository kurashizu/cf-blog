import { marked } from 'marked';
import { createR2Client, type R2Client, type Env } from './r2';
import { parseFrontmatter } from './frontmatter';
import { r2Paths } from './r2-paths';

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

export function markdownToHtml(md: string): string {
  const result = marked.parse(md, { gfm: true, breaks: true });
  return typeof result === 'string' ? result : '';
}

function parsePost(slug: string, content: string, key?: string): Post {
  const { data, body } = parseFrontmatter(content);
  const postSlug = key ? key.replace('articles/', '').replace('.md', '') : slug;
  return {
    slug: postSlug,
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
}

export function createArticlesRepo(env: Env) {
  const client: R2Client = createR2Client(env);

  return {
    async getBySlug(slug: string): Promise<Post | null> {
      try {
        const key = r2Paths.article(slug);
        const content = await client.get(key);
        return parsePost(slug, content, key);
      } catch {
        return null;
      }
    },

    async getAll(): Promise<Post[]> {
      try {
        const keys = await client.list(r2Paths.articlesPrefix);
        const posts: Post[] = [];

        for (const key of keys) {
          if (!key.endsWith('.md')) continue;
          try {
            const content = await client.get(key);
            const post = parsePost('', content, key);
            if (post.draft || !post.published) continue;
            posts.push(post);
          } catch {
            continue;
          }
        }

        return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      } catch (error) {
        console.error('Failed to get all posts:', error);
        return [];
      }
    },

    async getRecent(limit: number = 5): Promise<Post[]> {
      const posts = await this.getAll();
      return posts.slice(0, limit);
    },

    async save(slug: string, content: string): Promise<void> {
      const key = r2Paths.article(slug);
      await client.put(key, content);
    },

    async delete(slug: string): Promise<void> {
      const key = r2Paths.article(slug);
      await client.delete(key);
    },
  };
}
