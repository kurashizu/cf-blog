'use client';

import { useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface GuestbookFormProps {
  onSuccess?: () => void;
}

export function GuestbookForm({ onSuccess }: GuestbookFormProps) {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || name.trim().length > 100) {
      setError('Name must be 1-100 characters');
      return;
    }
    if (!content.trim() || content.trim().length > 2000) {
      setError('Content must be 1-2000 characters');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          content: content.trim(),
          avatar: avatar.trim() || undefined,
          website: honeypotRef.current?.value,
        }),
      });

      const data = await res.json() as { error?: string; message?: unknown };

      if (!res.ok) {
        setError(data.error || 'Failed to post message');
        return;
      }

      setName('');
      setContent('');
      setAvatar('');
      onSuccess?.();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4">
      <Card>
        <div className="p-4 space-y-3">
          <div>
            <label htmlFor="gb-name" className="block text-xs text-text-muted mb-1">
              Name *
            </label>
            <input
              id="gb-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              className="w-full px-3 py-2 bg-bg-primary/50 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              placeholder="Your name"
            />
          </div>

          <div>
            <label htmlFor="gb-avatar" className="block text-xs text-text-muted mb-1">
              Avatar URL (optional)
            </label>
            <input
              id="gb-avatar"
              type="url"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary/50 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              placeholder="https://example.com/avatar.jpg"
            />
          </div>

          <div>
            <label htmlFor="gb-content" className="block text-xs text-text-muted mb-1">
              Message *
            </label>
            <textarea
              id="gb-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={2000}
              required
              rows={3}
              className="w-full px-3 py-2 bg-bg-primary/50 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-none"
              placeholder="Leave a message..."
            />
            <div className="text-right text-xs text-text-muted mt-0.5">
              {content.length}/2000
            </div>
          </div>

          {/* Honeypot - hidden from users */}
          <input
            ref={honeypotRef}
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
          />

          {error && (
            <p className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Posting...' : 'Post Message'}
          </Button>
        </div>
      </Card>
    </form>
  );
}