import { NextResponse } from 'next/server';
import { runCanadaDiscover } from '../../../../../lib/services/canada/discover';
import { CANADA_PROGRAM_TYPES, type CanadaProgramType } from '../../../../lib/canada/constants';

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = request.headers.get('x-cron-secret');
    if (provided !== cronSecret) {
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

  try {
    const result = await runCanadaDiscover(programType);
    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[canada-discover] failed', e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
