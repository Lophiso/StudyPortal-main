import { NextResponse } from 'next/server';
import type { Database } from '../../../lib/database.types';
import { createServerSupabaseClient } from '../../../lib/supabaseServer';
import type { CanadaOpportunityPublic } from '../../../lib/canada/types';
import {
  CANADA_FUNDING_TYPES,
  CANADA_PROGRAM_TYPES,
  CANADA_TRI_STATES,
  type CanadaFundingType,
  type CanadaProgramType,
  type CanadaTriState,
} from '../../../lib/canada/constants';

function getIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

const ipBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimitOk(ip: string, maxPerMinute: number) {
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= maxPerMinute) return false;
  bucket.count += 1;
  return true;
}

function pickPublic(row: Database['public']['Tables']['canada_opportunity']['Row']): CanadaOpportunityPublic {
  return {
    id: row.id,
    program_type: row.program_type,
    province: row.province,
    city: row.city,
    institution_name: row.institution_name,
    department: row.department,
    lab_group: row.lab_group,
    title_clean: row.title_clean,
    nutshell_15_words: row.nutshell_15_words,
    funding_type: row.funding_type,
    funding_confidence: row.funding_confidence,
    funding_evidence: row.funding_evidence,
    international_allowed: row.international_allowed,
    eligibility_confidence: row.eligibility_confidence,
    eligibility_notes: row.eligibility_notes,
    eligibility_evidence: row.eligibility_evidence,
    start_term: row.start_term,
    deadline_date: row.deadline_date,
    deadline_confidence: row.deadline_confidence,
    deadline_evidence: row.deadline_evidence,
    application_url: row.application_url,
    canonical_url: row.canonical_url,
    last_verified_at: row.last_verified_at,
    freshness_score: row.freshness_score,
    status: row.status,
  };
}

function parseProgramType(v: string | null): CanadaProgramType | null {
  if (!v) return null;
  return (CANADA_PROGRAM_TYPES as readonly string[]).includes(v) ? (v as CanadaProgramType) : null;
}

function parseFundingType(v: string | null): CanadaFundingType | null {
  if (!v) return null;
  return (CANADA_FUNDING_TYPES as readonly string[]).includes(v) ? (v as CanadaFundingType) : null;
}

function parseTriState(v: string | null): CanadaTriState | null {
  if (!v) return null;
  return (CANADA_TRI_STATES as readonly string[]).includes(v) ? (v as CanadaTriState) : null;
}

export async function GET(request: Request) {
  const ip = getIp(request);
  if (!rateLimitOk(ip, 60)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  let supabase: ReturnType<typeof createServerSupabaseClient>;
  try {
    supabase = createServerSupabaseClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Server misconfigured';
    return NextResponse.json({ error: message }, { status: 500 });
  }
  const url = new URL(request.url);

  const id = url.searchParams.get('id');
  if (id) {
    const { data, error } = await supabase
      .from('canada_opportunity')
      .select('*')
      .eq('id', id)
      .single()
      .returns<Database['public']['Tables']['canada_opportunity']['Row']>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data: pickPublic(data) }, { status: 200 });
  }

  const programType = parseProgramType(url.searchParams.get('program_type'));
  if (!programType) {
    return NextResponse.json({ error: 'program_type is required' }, { status: 400 });
  }

  const rawLimit = Number(url.searchParams.get('limit') ?? '24');
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 24;
  const cursor = url.searchParams.get('cursor');

  const fundingType = parseFundingType(url.searchParams.get('funding_type'));
  const province = (url.searchParams.get('province') ?? '').trim();
  const institution = (url.searchParams.get('institution') ?? '').trim();
  const startTerm = (url.searchParams.get('start_term') ?? '').trim();
  const internationalAllowed = parseTriState(url.searchParams.get('international_allowed'));

  const rawWithinDays = url.searchParams.get('deadline_within_days');
  const withinDays = rawWithinDays ? Number(rawWithinDays) : null;

  let query = supabase
    .from('canada_opportunity')
    .select('*')
    .eq('program_type', programType)
    .in('status', ['ACTIVE', 'NEEDS_REVIEW'])
    .order('last_verified_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt('last_verified_at', cursor);
  }
  if (fundingType) query = query.eq('funding_type', fundingType);
  if (province) query = query.eq('province', province);
  if (internationalAllowed) query = query.eq('international_allowed', internationalAllowed);
  if (startTerm) query = query.eq('start_term', startTerm);
  if (institution) query = query.ilike('institution_name', `%${institution}%`);

  if (Number.isFinite(withinDays) && withinDays !== null && withinDays > 0) {
    const end = new Date(Date.now() + withinDays * 24 * 3600 * 1000).toISOString().slice(0, 10);
    query = query.not('deadline_date', 'is', null).lte('deadline_date', end);
  }

  const { data, error } = await query.returns<Database['public']['Tables']['canada_opportunity']['Row'][]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const sliced = rows.slice(0, limit);
  const next = rows.length > limit ? sliced[sliced.length - 1]?.last_verified_at ?? null : null;

  return NextResponse.json(
    {
      data: sliced.map(pickPublic),
      nextCursor: next,
    },
    { status: 200 },
  );
}
