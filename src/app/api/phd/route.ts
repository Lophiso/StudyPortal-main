import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../lib/database.types';

export async function GET(request: Request) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'SUPABASE_URL and SUPABASE_KEY must be set' },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const rawLimit = Number(url.searchParams.get('limit') ?? '500');
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 1000) : 500;

  const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

  if (id) {
    const { data, error } = await supabase
      .from('JobOpportunity')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data }, { status: 200 });
  }

  const { data, error } = await supabase
    .from('JobOpportunity')
    .select('*')
    .or('type.eq.PHD,isPhd.eq.true')
    .order('postedAt', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] }, { status: 200 });
}
