import { NextResponse } from 'next/server';
import { getPostBySlug, initializeR2Client } from '@/lib/posts';
import { buildFrontmatter } from '@/lib/r2';

/**
 * GET /api/posts/[slug] - Get a single post
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const post = await getPostBySlug(slug);

    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error('Failed to fetch post:', error);
    return NextResponse.json(
      { error: 'Failed to fetch post' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/posts/[slug] - Update a post
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { title, content, date, description, tags, coverImage, author, draft, published } = body;

    // Validate required fields
    if (!title && !content) {
      return NextResponse.json(
        { error: 'At least one field (title or content) is required' },
        { status: 400 }
      );
    }

    // Get existing post first
    const existingPost = await getPostBySlug(slug);
    if (!existingPost) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    // Build updated post data
    const postData = {
      title: title || existingPost.title,
      date: date || existingPost.date,
      slug,
      description: description || existingPost.description,
      tags: tags || existingPost.tags,
      published: published !== undefined ? published : existingPost.published,
      coverImage: coverImage || existingPost.coverImage || '',
      author: author || existingPost.author,
      draft: draft !== undefined ? draft : existingPost.draft,
    };

    // Build frontmatter
    const frontmatter = buildFrontmatter(postData);
    const fullContent = `${frontmatter}\n\n${content || existingPost.content}`;

    // Save to R2
    const client = initializeR2Client();
    const key = `articles/${slug}.md`;
    await client.saveArticle(key, fullContent);

    return NextResponse.json({
      success: true,
      post: { ...postData, content: content || existingPost.content }
    });
  } catch (error) {
    console.error('Failed to update post:', error);
    return NextResponse.json(
      { error: 'Failed to update post' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/posts/[slug] - Delete a post
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Check if post exists
    const existingPost = await getPostBySlug(slug);
    if (!existingPost) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    // Delete from R2
    const client = initializeR2Client();
    const key = `articles/${slug}.md`;
    await client.deleteArticle(key);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete post:', error);
    return NextResponse.json(
      { error: 'Failed to delete post' },
      { status: 500 }
    );
  }
}
