import { NextResponse } from 'next/server';
import { createArticlesRepo } from '@/lib/articles';
import { buildFrontmatter } from '@/lib/frontmatter';
import {
  coalesce,
  isValidSlug,
  validatePostInput,
  type PostInput,
} from '@/lib/post-input';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!isValidSlug(slug)) {
      return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });
    }

    const repo = createArticlesRepo();
    const post = await repo.getBySlug(slug);
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    return NextResponse.json({ post });
  } catch (error) {
    console.error('Failed to fetch post:', error);
    return NextResponse.json({ error: 'Failed to fetch post' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!isValidSlug(slug)) {
      return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });
    }

    const body = await request.json() as PostInput;
    const { title, content, date, description, tags, category, coverImage, externalUrl, author, draft, published } = body;

    const invalid = validatePostInput(body);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    if (!title && !content) {
      return NextResponse.json({ error: 'At least one field is required' }, { status: 400 });
    }

    const repo = createArticlesRepo();
    const existingPost = await repo.getBySlug(slug);
    if (!existingPost) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const newSlug = slug;
    const oldSlug = existingPost.slug;

    // Collapse the two spellings into one authoritative flag before
    // writing. Emitting both `published` and `draft` lets them contradict
    // each other in the frontmatter; `published` is what repo.save reads.
    const nextPublished =
      published !== undefined
        ? published
        : draft !== undefined
          ? !draft
          : existingPost.published;

    // `coalesce`, not `||`: an empty string is a deliberate "clear this
    // field", which the old fallback silently reverted.
    const postData = {
      title: title || existingPost.title,
      date: coalesce(date, existingPost.date),
      slug: newSlug,
      description: coalesce(description, existingPost.description),
      tags: coalesce(tags, existingPost.tags),
      category: coalesce(category, existingPost.category),
      published: nextPublished,
      coverImage: coalesce(coverImage, existingPost.coverImage ?? ''),
      externalUrl: coalesce(externalUrl, existingPost.externalUrl ?? ''),
      author: author || existingPost.author,
    };

    const frontmatter = buildFrontmatter(postData);
    const fullContent = `${frontmatter}\n\n${content ?? existingPost.content}`;

    await repo.save(newSlug, fullContent);

    if (newSlug !== oldSlug) {
      await repo.delete(oldSlug);
    }

    return NextResponse.json({ success: true, post: { ...postData, content: content || existingPost.content } });
  } catch (error) {
    console.error('Failed to update post:', error);
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!isValidSlug(slug)) {
      return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });
    }

    const repo = createArticlesRepo();
    const existingPost = await repo.getBySlug(slug);
    if (!existingPost) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    await repo.delete(slug);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete post:', error);
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
  }
}
