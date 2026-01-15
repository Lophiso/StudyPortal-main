import { NextResponse } from 'next/server';
import { runCanadaReaper } from '../../../../../lib/services/canada/reaper';

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = request.headers.get('x-cron-secret');
    const ua = request.headers.get('user-agent') ?? '';
    const vercelCron = ua.startsWith('vercel-cron/');
    if (provided !== cronSecret && !vercelCron) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await runCanadaReaper();
    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[canada-reaper] failed', e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
