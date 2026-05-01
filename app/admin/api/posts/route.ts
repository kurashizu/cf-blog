import { NextResponse } from 'next/server';
import { createArticlesRepo } from '@/lib/articles';
import { buildFrontmatter } from '@/lib/frontmatter';

export const dynamic = "force-dynamic";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug) && slug.length >= 1 && slug.length <= 200;
}

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

    if (!isValidSlug(slug)) {
      return NextResponse.json({ error: 'Invalid slug format (use lowercase letters, numbers, and hyphens only)' }, { status: 400 });
    }

    if (content.length > 500000) {
      return NextResponse.json({ error: 'Content too large (max 500KB)' }, { status: 400 });
    }

    if (title.length > 300) {
      return NextResponse.json({ error: 'Title too long (max 300 characters)' }, { status: 400 });
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

    const repo = createArticlesRepo();
    await repo.save(slug, fullContent);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to create post:', error);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}
