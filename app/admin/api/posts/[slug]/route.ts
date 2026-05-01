import { NextResponse } from 'next/server';
import { createArticlesRepo } from '@/lib/articles';
import { buildFrontmatter } from '@/lib/frontmatter';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug) && slug.length >= 1 && slug.length <= 200;
}

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

    const body = await request.json() as {
      title?: string;
      content?: string;
      date?: string;
      description?: string;
      tags?: string[];
      coverImage?: string;
      author?: string;
      draft?: boolean;
      published?: boolean;
    };
    const { title, content, date, description, tags, coverImage, author, draft, published } = body;

    // Validate content length
    if (content && content.length > 500000) {
      return NextResponse.json({ error: 'Content too large (max 500KB)' }, { status: 400 });
    }

    // Validate title length
    if (title && title.length > 300) {
      return NextResponse.json({ error: 'Title too long (max 300 characters)' }, { status: 400 });
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

    const postData = {
      title: title || existingPost.title,
      date: date || existingPost.date,
      slug: newSlug,
      description: description || existingPost.description,
      tags: tags || existingPost.tags,
      published: published !== undefined ? published : existingPost.published,
      coverImage: coverImage || existingPost.coverImage || '',
      author: author || existingPost.author,
      draft: draft !== undefined ? draft : existingPost.draft,
    };

    const frontmatter = buildFrontmatter(postData);
    const fullContent = `${frontmatter}\n\n${content || existingPost.content}`;

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
