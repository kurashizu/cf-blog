import { NextRequest, NextResponse } from 'next/server';
import { refreshAllCaches } from '@/lib/refresh-cache';

export async function POST(request: NextRequest) {
  try {
    const ctx = (await import('@opennextjs/cloudflare')).getCloudflareContext() as {
      env: { CRON_SECRET?: string };
    };
    const secret = ctx.env.CRON_SECRET;

    const auth = request.headers.get('authorization');
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results = await refreshAllCaches();
    return NextResponse.json({ ok: true, ...results });
  } catch (error) {
    console.error('Cache refresh error:', error);
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
  }
}
