import { NextResponse } from 'next/server';
import { runCanadaVerify } from '../../../../../lib/services/canada/verify';
import { CANADA_PROGRAM_TYPES, type CanadaProgramType } from '../../../../lib/canada/constants';

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

  const url = new URL(request.url);
  const rawProgramType = url.searchParams.get('program_type');
  const programType: CanadaProgramType | undefined = rawProgramType
    ? (CANADA_PROGRAM_TYPES as readonly string[]).includes(rawProgramType)
      ? (rawProgramType as CanadaProgramType)
      : undefined
    : undefined;
  const rawLimit = url.searchParams.get('limit');
  const parsedLimit = rawLimit ? Number(rawLimit) : NaN;
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : undefined;

  try {
    const result = await runCanadaVerify({ programType, limit });
    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[canada-verify] failed', e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
