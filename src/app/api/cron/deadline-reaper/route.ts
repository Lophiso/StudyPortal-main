import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = request.headers.get('x-cron-secret');
    if (provided !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'SUPABASE_URL and SUPABASE_KEY must be set' },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const today = new Date().toISOString().slice(0, 10);

  try {
    const { data, error } = await supabase
      .from('JobOpportunity')
      .delete()
      .not('deadline', 'is', null)
      .lt('deadline', today)
      .select('id, title, type, deadline');

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        today,
        deletedCount: data?.length ?? 0,
        deleted: data ?? [],
      },
      { status: 200 },
    );
  } catch (e: any) {
    console.error('[deadline-reaper] failed', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
