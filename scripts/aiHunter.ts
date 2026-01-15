import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_KEY;
const tavilyApiKey = process.env.TAVILY_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_KEY must be set');
}
if (!tavilyApiKey) {
  throw new Error('TAVILY_API_KEY must be set for aiHunter');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type HunterType = 'PHD' | 'JOB';

interface RawResult {
  queryTag: string;
  type: HunterType;
  title: string;
  url: string;
  snippet: string;
}

function toIsoDateString(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeDeadline(raw: string | null | undefined) {
  if (!raw) return null;
  const s = raw.toString().trim();
  if (!s) return null;

  const iso = s.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (iso) return iso;

  const parsed = new Date(s);
  if (!Number.isFinite(parsed.getTime())) return null;
  return toIsoDateString(parsed);
}

function extractDeadlineFromText(text: string) {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (iso) return iso;

  const monthMap: Record<string, number> = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
  };

  const t = text.toLowerCase();
  const ctx = t.match(/(deadline|closing date|apply by|applications close|application deadline)[^\n]{0,140}/)?.[0];
  const scope = ctx ?? t;

  const m1 = scope.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/,
  );
  if (m1) {
    const month = monthMap[m1[1]];
    const day = Number(m1[2]);
    const year = Number(m1[3]);
    const d = new Date(Date.UTC(year, month, day));
    if (Number.isFinite(d.getTime())) return toIsoDateString(d);
  }

  return null;
}

async function huntWithTavily(query: string, type: HunterType, queryTag: string): Promise<RawResult[]> {
  console.log('[aiHunter] Tavily search', { query, type, queryTag });

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tavilyApiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth: 'advanced',
      include_answer: true,
      max_results: 10,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[aiHunter] Tavily HTTP error', res.status, text);
    return [];
  }

  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  const results = data.results ?? [];

  return results
    .filter((r) => r.url && r.title)
    .map((r) => ({
      queryTag,
      type,
      title: r.title!.trim(),
      url: r.url!,
      snippet: (r.content ?? '').trim(),
    }));
}

function dedupeByUrl(items: RawResult[]): RawResult[] {
  const seen = new Set<string>();
  const out: RawResult[] = [];
  for (const item of items) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

async function upsertFromResult(result: RawResult) {
  const isPhdType = result.type === 'PHD';

  const combinedText = `${result.title}\n${result.snippet}`;
  const deadline = normalizeDeadline(result.snippet) ?? extractDeadlineFromText(combinedText);

  const payload: any = {
    title: result.title,
    type: isPhdType ? 'PHD' : 'JOB',
    company: 'Unknown',
    country: 'Unknown',
    city: 'Unknown',
    description: result.snippet || null,
    requirements: ['See full description for details.'],
    deadline: deadline ?? null,
    postedAt: new Date().toISOString(),
    applicationLink: result.url,
    source: `TAVILY_${result.queryTag}`,
  };

  const { error } = await supabase
    .from('JobOpportunity')
    .upsert(payload, { onConflict: 'applicationLink' });

  if (error) {
    console.error('[aiHunter] upsert error for', result.url, error.message);
  }
}

export async function runAiHunter() {
  console.log('[aiHunter] starting Tavily AI hunter');

  const queries: Array<{ q: string; type: HunterType; tag: string }> = [
    {
      q: 'PhD position Artificial Intelligence Europe funded',
      type: 'PHD',
      tag: 'PHD_AI_EUROPE',
    },
    {
      q: 'Marie Curie Fellowship 2025 deadline',
      type: 'PHD',
      tag: 'PHD_MARIE_CURIE',
    },
    {
      q: 'Junior DevOps Engineer remote Italy',
      type: 'JOB',
      tag: 'JOB_JUNIOR_DEVOPS_IT_REMOTE',
    },
    {
      q: 'React Developer remote Europe',
      type: 'JOB',
      tag: 'JOB_REACT_EUROPE_REMOTE',
    },
  ];

  const allResults: RawResult[] = [];

  for (const { q, type, tag } of queries) {
    try {
      const results = await huntWithTavily(q, type, tag);
      console.log('[aiHunter] query results', { tag, count: results.length });
      allResults.push(...results);
    } catch (e) {
      console.error('[aiHunter] Tavily search failed', { query: q, tag, error: (e as Error).message });
    }
  }

  const unique = dedupeByUrl(allResults);
  console.log('[aiHunter] total tavily results:', allResults.length);
  console.log('[aiHunter] unique after dedupe:', unique.length);

  for (const result of unique) {
    try {
      await upsertFromResult(result);
    } catch (e) {
      console.error('[aiHunter] failed to upsert result', result.url, e);
    }
  }

  console.log('[aiHunter] completed run');
}

runAiHunter().catch((e) => {
  console.error('[aiHunter] fatal error', e);
  process.exitCode = 1;
});
