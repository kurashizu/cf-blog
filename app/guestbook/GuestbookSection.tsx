'use client';

import { useState } from 'react';
import { GuestbookMessages } from '@/components/guestbook/GuestbookMessages';
import { GuestbookForm } from '@/components/guestbook/GuestbookForm';

export function GuestbookSection() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSuccess = () => {
    setRefreshKey((k) => k + 1);
  };

  return (
    <section className="mt-12">
      <h2 className="section-title mb-3">Guestbook</h2>
      <GuestbookMessages key={refreshKey} />
      <GuestbookForm onSuccess={handleSuccess} />
    </section>
  );
}