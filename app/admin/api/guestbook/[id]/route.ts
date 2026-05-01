import { NextResponse } from 'next/server';
import { createGuestbookRepo } from '@/lib/guestbook';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const repo = createGuestbookRepo();
    const success = await repo.approve(id);
    if (!success) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Guestbook approve error:', error);
    return NextResponse.json({ error: 'Failed to approve message' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const repo = createGuestbookRepo();
    const success = await repo.delete(id);
    if (!success) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Guestbook delete error:', error);
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
  }
}