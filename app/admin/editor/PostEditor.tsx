'use client';

import { useState, useEffect } from 'react';
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
    <form onSubmit={handleSubmit} className="admin-editor">
      {/* Header with title and actions */}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">Edit Post</h1>
        <div className="flex gap-2.5">
          <Button type="button" variant="secondary" className="btn-danger">
            Delete
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Form fields */}
      <div className="space-y-4">
        <div className="form-group">
          <label htmlFor="title" className="form-label">Title</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Post title"
            className="form-input"
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="slug" className="form-label">Slug</label>
            <input
              id="slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="post-slug"
              className="form-input"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="date" className="form-label">Date</label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="form-input"
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="tags" className="form-label">Tags (comma-separated)</label>
          <input
            id="tags"
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tech, tutorial, guide"
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="coverImage" className="form-label">Cover Image URL</label>
          <input
            id="coverImage"
            type="url"
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            placeholder="https://..."
            className="form-input"
          />
        </div>

        <div className="form-group">
          <div className="mb-2 flex items-center gap-2">
            <label htmlFor="published" className="form-label mb-0">Publish</label>
            <input
              type="checkbox"
              id="published"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-bg-secondary text-accent focus:ring-accent"
            />
          </div>
        </div>
      </div>

      {/* Split Editor/Preview */}
      <div className="mt-6">
        <label className="form-label mb-4">Content</label>
        <div className="editor-container">
          <div className="editor-pane">
            <div className="pane-header">Markdown</div>
            <div className="pane-content">
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your post content here..."
                className="editor-textarea"
                required
              />
            </div>
          </div>
          <div className="preview-pane">
            <div className="pane-header">Preview</div>
            <div className="pane-content">
              {preview ? (
                <div
                  className="preview-content"
                  dangerouslySetInnerHTML={{ __html: preview }}
                />
              ) : (
                <p className="text-text-muted">Start typing to see preview...</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            'mt-4 rounded-lg p-4',
            message.type === 'success'
              ? 'bg-green-500/10 text-green-400'
              : 'bg-red-500/10 text-red-400'
          )}
        >
          {message.text}
        </div>
      )}
    </form>
  );
}