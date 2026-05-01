'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { formatDate } from '@/lib/utils';

interface GuestbookMessage {
  id: string;
  name: string;
  content: string;
  timestamp: string;
  avatar?: string;
  avatarIndex?: number;
}

interface GuestbookMessagesProps {
  initialMessages?: GuestbookMessage[];
}

const AVATAR_COUNT = 9;

function getAvatarSrc(message: GuestbookMessage): string {
  if (message.avatar) {
    return message.avatar;
  }
  const index = message.avatarIndex ?? 0;
  return `/images/avatar/avatar_${index % AVATAR_COUNT}.png`;
}

export function GuestbookMessages({ initialMessages }: GuestbookMessagesProps) {
  const [messages, setMessages] = useState<GuestbookMessage[]>(initialMessages ?? []);
  const [loading, setLoading] = useState(!initialMessages);

  useEffect(() => {
    if (initialMessages) return;
    fetch('/api/guestbook')
      .then((res) => res.json() as Promise<{ messages?: GuestbookMessage[] }>)
      .then((data) => {
        if (data.messages) setMessages(data.messages);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [initialMessages]);

  if (loading) {
    return (
      <div className="text-center py-6 text-text-muted text-sm">
        Loading messages...
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-6 text-text-muted text-sm">
          No messages yet. Be the first to leave a message!
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => (
        <Card key={msg.id}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <img
                src={getAvatarSrc(msg)}
                alt={msg.name}
                className="w-10 h-10 rounded-full object-cover shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-text-primary text-sm">{msg.name}</span>
                  <span className="text-xs text-text-muted">{formatDate(msg.timestamp)}</span>
                </div>
                <p className="text-text-secondary text-sm whitespace-pre-wrap break-words">
                  {msg.content}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function useGuestbookRefresh() {
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey((k) => k + 1);

  return { refreshKey, refresh };
}