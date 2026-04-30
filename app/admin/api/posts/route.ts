import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createArticlesRepo } from '@/lib/articles';
import { buildFrontmatter } from '@/lib/frontmatter';

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      title?: string;
      slug?: string;
      content?: string;
      date?: string;
      description?: string;
      tags?: string[];
      coverImage?: string;
      author?: string;
      draft?: boolean;
      published?: boolean;
    };
    const { title, slug, content, date, description, tags, coverImage, author, draft, published } = body;

    if (!slug || !content || !title) {
      return NextResponse.json({ error: 'Missing required fields: title, slug, content' }, { status: 400 });
    }

    const postData = {
      title,
      date: date || new Date().toISOString().split('T')[0],
      slug,
      description: description || '',
      tags: tags || [],
      published: published ?? false,
      coverImage: coverImage || '',
      author: author || 'Kurashizu',
      draft: draft ?? false,
    };

    const frontmatter = buildFrontmatter(postData);
    const fullContent = `${frontmatter}\n\n${content}`;

    const { env } = getCloudflareContext();
    const repo = createArticlesRepo(env);
    await repo.save(slug, fullContent);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to create post:', error);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}
