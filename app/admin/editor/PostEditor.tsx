'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

// Simple markdown to HTML converter for preview
function markdownToHtml(md: string): string {
  if (!md) return '';

  let html = md
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```([\s\S]+?)```/g, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    // Line breaks (paragraphs)
    .replace(/\n\n/g, '</p><p>')
    // Single line breaks
    .replace(/\n/g, '<br>');

  // Wrap in paragraph tags if not already wrapped
  if (!html.startsWith('<')) {
    html = '<p>' + html + '</p>';
  }

  return html;
}

interface PostData {
  title: string;
  slug: string;
  date: string;
  tags: string;
  published: boolean;
  coverImage: string;
  content: string;
}

interface PostEditorProps {
  initialData?: Partial<PostData>;
  onSubmit?: (data: PostData) => void;
}

export default function PostEditor({ initialData, onSubmit }: PostEditorProps) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [slug, setSlug] = useState(initialData?.slug || '');
  const [date, setDate] = useState(
    initialData?.date || new Date().toISOString().split('T')[0]
  );
  const [tags, setTags] = useState(initialData?.tags || '');
  const [published, setPublished] = useState(initialData?.published ?? true);
  const [coverImage, setCoverImage] = useState(initialData?.coverImage || '');
  const [content, setContent] = useState(initialData?.content || '');
  const [preview, setPreview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Update preview when content changes
  useEffect(() => {
    if (content) {
      const html = markdownToHtml(content);
      setPreview(html);
    } else {
      setPreview('');
    }
  }, [content]);

  // Auto-generate slug from title
  useEffect(() => {
    if (!initialData?.slug && title) {
      const autoSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      setSlug(autoSlug);
    }
  }, [title, initialData?.slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const postData: PostData = {
      title,
      slug,
      date,
      tags,
      published,
      coverImage,
      content,
    };

    if (onSubmit) {
      onSubmit(postData);
      return;
    }

    // Default behavior: submit to API
    try {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Post saved successfully!' });
        // Reset form for new post
        setTitle('');
        setSlug('');
        setContent('');
        setTags('');
        setCoverImage('');
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.message || 'Failed to save post' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save post' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-[calc(100vh-200px)] gap-6">
      {/* Editor Panel */}
      <div className="flex-1 space-y-4 overflow-y-auto pr-4">
        <h2 className="text-lg font-semibold text-text-primary">Edit Post</h2>

        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title"
          required
        />

        <Input
          label="Slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="post-slug"
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />

          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="published"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-bg-secondary text-accent focus:ring-accent"
            />
            <label htmlFor="published" className="text-sm text-text-secondary">
              Published
            </label>
          </div>
        </div>

        <Input
          label="Tags (comma-separated)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="tech, tutorial, guide"
        />

        <Input
          label="Cover Image URL"
          value={coverImage}
          onChange={(e) => setCoverImage(e.target.value)}
          placeholder="https://..."
        />

        <Textarea
          label="Content (Markdown)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your post content here..."
          className="min-h-[400px] font-mono"
          required
        />

        <div className="flex gap-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Post'}
          </Button>
        </div>

        {message && (
          <div
            className={cn(
              'rounded-lg p-4',
              message.type === 'success'
                ? 'bg-green-500/10 text-green-400'
                : 'bg-red-500/10 text-red-400'
            )}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* Preview Panel */}
      <div className="flex-1 overflow-y-auto border-l border-border pl-4">
        <h2 className="mb-4 text-lg font-semibold text-text-primary">Preview</h2>
        <div className="rounded-lg bg-bg-card p-6">
          {preview ? (
            <div
              className="prose prose-invert max-w-none prose-headings:text-text-primary prose-p:text-text-secondary prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-code:text-accent prose-code:bg-bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-bg-secondary"
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          ) : (
            <p className="text-text-muted">Start typing to see preview...</p>
          )}
        </div>
      </div>
    </form>
  );
}