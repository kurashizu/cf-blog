"use client";

import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { formatDate } from "@/lib/utils";

interface Post {
  slug: string;
  title: string;
  content: string;
  date: string;
  author: string;
  tags: string[];
  coverImage?: string;
}

interface BlogArticleProps {
  post: Post;
}

export function BlogArticle({ post }: BlogArticleProps) {
  return (
    <article className="article-content">
      <a href="/blog" className="back-link">
        ← Back to blog
      </a>

      <header className="article-header">
        {post.coverImage && (
          <div className="mb-8 aspect-video w-full overflow-hidden rounded-lg">
            <img
              src={post.coverImage}
              alt={post.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <h1>{post.title}</h1>

        <div className="article-meta-row mb-3">
          <span>{formatDate(post.date)}</span>
          <span>·</span>
          <span>{post.author}</span>
        </div>

        {post.tags.length > 0 && (
          <div className="article-tags">
            {post.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </header>

      <MarkdownRenderer className="article-body">
        {post.content}
      </MarkdownRenderer>
    </article>
  );
}