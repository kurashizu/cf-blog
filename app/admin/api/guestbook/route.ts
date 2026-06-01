import { NextResponse } from 'next/server';
import { createGuestbookRepo } from '@/lib/guestbook';

export async function GET() {
  try {
    const repo = createGuestbookRepo();
    const messages = await repo.getAllForAdmin();
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Admin guestbook GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}