import { NextResponse } from 'next/server';
import { createArticlesRepo } from '@/lib/articles';
import { buildFrontmatter } from '@/lib/frontmatter';
import { isValidSlug, validatePostInput, type PostInput } from '@/lib/post-input';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json() as PostInput;
    const { title, slug, content, date, description, tags, coverImage, externalUrl, author, draft, published } = body;

    if (!slug || !content || !title) {
      return NextResponse.json({ error: 'Missing required fields: title, slug, content' }, { status: 400 });
    }

    if (!isValidSlug(slug)) {
      return NextResponse.json({ error: 'Invalid slug format (use lowercase letters, numbers, and hyphens only)' }, { status: 400 });
    }

    const invalid = validatePostInput(body);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    // One authoritative flag — see the update route for why both spellings
    // must not reach the frontmatter together.
    const postData = {
      title,
      date: date || new Date().toISOString().split('T')[0],
      slug,
      description: description || '',
      tags: tags || [],
      published: published !== undefined ? published : draft === undefined ? true : !draft,
      coverImage: coverImage || '',
      externalUrl: externalUrl || '',
      author: author || 'Kurashizu',
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
