import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../lib/supabaseServer';

function getProjectRef(supabaseUrl: string | undefined) {
  if (!supabaseUrl) return null;
  try {
    const u = new URL(supabaseUrl);
    const host = u.hostname;
    const first = host.split('.')[0];
    return first || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasSupabaseUrl = Boolean(supabaseUrl);
  const hasSupabaseKey = Boolean(process.env.SUPABASE_KEY);
  const hasCronSecret = Boolean(process.env.CRON_SECRET);

  let supabase;
  try {
    supabase = createServerSupabaseClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      {
        ok: false,
        error: message,
        env: { hasSupabaseUrl, hasSupabaseKey, hasCronSecret },
        supabaseProjectRef: getProjectRef(supabaseUrl),
      },
      { status: 500 },
    );
  }

  const { count: sourcesCount, error: sourcesError } = await supabase
    .from('canada_sources')
    .select('*', { count: 'exact', head: true });

  const { count: opportunityCount, error: opportunityError } = await supabase
    .from('canada_opportunity')
    .select('*', { count: 'exact', head: true });

  return NextResponse.json(
    {
      ok: true,
      env: { hasSupabaseUrl, hasSupabaseKey, hasCronSecret },
      supabaseProjectRef: getProjectRef(supabaseUrl),
      canada: {
        sourcesCount: sourcesCount ?? null,
        opportunityCount: opportunityCount ?? null,
        sourcesError: sourcesError?.message ?? null,
        opportunityError: opportunityError?.message ?? null,
      },
    },
    { status: 200 },
  );
}
