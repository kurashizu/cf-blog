import { NextResponse } from 'next/server';
import { getAllPosts, initializeR2Client } from '@/lib/posts';
import { buildFrontmatter } from '@/lib/r2';

/**
 * GET /api/posts - List all posts
 */
export async function GET() {
  try {
    const posts = await getAllPosts();
    return NextResponse.json({ posts });
  } catch (error) {
    console.error('Failed to fetch posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/posts - Create a new post
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, slug, content, date, description, tags, coverImage, author, draft, published } = body;

    // Validate required fields
    if (!title || !slug || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: title, slug, and content are required' },
        { status: 400 }
      );
    }

    // Build post data with defaults
    const postData = {
      title,
      date: date || new Date().toISOString().split('T')[0],
      slug,
      description: description || '',
      tags: tags || [],
      published: published !== false,
      coverImage: coverImage || '',
      author: author || 'Kurashizu',
      draft: draft === true,
    };

    // Build frontmatter
    const frontmatter = buildFrontmatter(postData);
    const fullContent = `${frontmatter}\n\n${content}`;

    // Save to R2
    const client = initializeR2Client();
    const key = `articles/${slug}.md`;
    await client.saveArticle(key, fullContent);

    return NextResponse.json({
      success: true,
      post: { ...postData, content }
    });
  } catch (error) {
    console.error('Failed to create post:', error);
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    );
  }
}
