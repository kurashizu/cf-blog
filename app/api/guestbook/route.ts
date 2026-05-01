import { NextResponse } from 'next/server';
import { createGuestbookRepo } from '@/lib/guestbook';
import { r2Paths } from '@/lib/r2-paths';
import { r2Get, r2Put } from '@/lib/r2';

const RATE_LIMIT_SECONDS = 300;

function sanitize(str: string): string {
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + 'guestbook-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function checkRateLimit(ip: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const ipHash = await hashIP(ip);
    const key = r2Paths.guestbookRateLimit(ipHash);
    const lastPost = await r2Get(key);
    if (lastPost) {
      const elapsed = (Date.now() - new Date(lastPost).getTime()) / 1000;
      if (elapsed < RATE_LIMIT_SECONDS) {
        return { allowed: false, retryAfter: Math.ceil(RATE_LIMIT_SECONDS - elapsed) };
      }
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

async function setRateLimit(ip: string): Promise<void> {
  try {
    const ipHash = await hashIP(ip);
    const key = r2Paths.guestbookRateLimit(ipHash);
    await r2Put(key, new Date().toISOString());
  } catch {
    // ignore rate limit set errors
  }
}

export async function GET() {
  try {
    const repo = createGuestbookRepo();
    const messages = await repo.getAll();
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Guestbook GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      name?: string;
      content?: string;
      email?: string;
      website?: string;
    };
    const { name, content, email, website } = body;

    // Honeypot check
    if (website) {
      return NextResponse.json({ error: 'Invalid submission' }, { status: 400 });
    }

    // Validation
    if (!name || name.trim().length < 1 || name.trim().length > 100) {
      return NextResponse.json({ error: 'Name must be 1-100 characters' }, { status: 400 });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (!content || content.trim().length < 1 || content.trim().length > 2000) {
      return NextResponse.json({ error: 'Content must be 1-2000 characters' }, { status: 400 });
    }

    // Rate limit
    const clientIP = request.headers.get('cf-connecting-ip') ||
                     request.headers.get('x-forwarded-for')?.split(',')[0] ||
                     'unknown';
    const rateCheck = await checkRateLimit(clientIP);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Rate limited. Please wait ${rateCheck.retryAfter} seconds before posting again.` },
        { status: 429 }
      );
    }

    const repo = createGuestbookRepo();
    const message = await repo.add({
      name: sanitize(name),
      content: sanitize(content),
      email: email?.trim(),
    });

    await setRateLimit(clientIP);

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error('Guestbook POST error:', error);
    return NextResponse.json({ error: 'Failed to post message' }, { status: 500 });
  }
}