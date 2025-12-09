import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types';

const supabaseUrl = process.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY as string;
const geminiApiKey = process.env.GEMINI_API_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase env vars VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set');
}

const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

const ACADEMIC_FEEDS = ['https://www.nature.com/naturecareers.rss'];
const TECH_FEEDS = ['https://stackoverflow.com/jobs/feed'];

export type EngineJobType = 'PHD' | 'JOB';

interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
  source: string;
  inferredType: EngineJobType;
}

interface GeminiEnriched {
  city: string | null;
  country: string | null;
  requirements: string[];
  deadline: string | null;
  isPhD: boolean;
}

function parseSimpleRss(xml: string, source: string, inferredType: EngineJobType): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i;
  const linkRegex = /<link>(.*?)<\/link>/i;
  const descRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/i;
  const dateRegex = /<pubDate>(.*?)<\/pubDate>/i;

  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml))) {
    const block = match[0];
    const titleMatch = block.match(titleRegex);
    const linkMatch = block.match(linkRegex);
    const descMatch = block.match(descRegex);
    const dateMatch = block.match(dateRegex);

    const title = (titleMatch?.[1] || titleMatch?.[2] || '').trim();
    const link = (linkMatch?.[1] || '').trim();
    const description = (descMatch?.[1] || descMatch?.[2] || '').trim();
    const pubDate = (dateMatch?.[1] || '').trim() || null;

    if (!title || !link) continue;

    items.push({
      title,
      link,
      description,
      pubDate,
      source,
      inferredType,
    });
  }

  return items;
}

async function callGemini(text: string): Promise<GeminiEnriched | null> {
  if (!geminiApiKey) return null;

  const prompt = `Analyze this text about a job or PhD opportunity. Extract a JSON object with this exact shape:
{
  "city": string | null,
  "country": string | null,
  "requirements": string[],
  "deadline": string | null,
  "isPhD": boolean
}

Text:
${text}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!res.ok) {
    console.error('Gemini HTTP error', res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const textOut = data?.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
  if (!textOut) return null;

  try {
    const jsonMatch = textOut.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : textOut);
    return {
      city: parsed.city ?? null,
      country: parsed.country ?? null,
      requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
      deadline: parsed.deadline ?? null,
      isPhD: Boolean(parsed.isPhD),
    };
  } catch (e) {
    console.error('Failed to parse Gemini JSON', e, textOut);
    return null;
  }
}

export async function runRealtimeIngestion() {
  const feedItems: FeedItem[] = [];

  for (const url of ACADEMIC_FEEDS) {
    try {
      const res = await fetch(url);
      const xml = await res.text();
      feedItems.push(...parseSimpleRss(xml, url, 'PHD'));
    } catch (e) {
      console.error('Error fetching academic feed', url, e);
    }
  }

  for (const url of TECH_FEEDS) {
    try {
      const res = await fetch(url);
      const xml = await res.text();
      feedItems.push(...parseSimpleRss(xml, url, 'JOB'));
    } catch (e) {
      console.error('Error fetching tech feed', url, e);
    }
  }

  const uniqueByLink = new Map<string, FeedItem>();
  for (const item of feedItems) {
    if (!uniqueByLink.has(item.link)) {
      uniqueByLink.set(item.link, item);
    }
  }

  const items = Array.from(uniqueByLink.values()).slice(0, 50);

  const results: { link: string; status: 'created' | 'updated' }[] = [];

  for (const item of items) {
    const enriched = await callGemini(item.description);

    const city = enriched?.city || '';
    const country = enriched?.country || '';
    const requirements = enriched?.requirements && enriched.requirements.length > 0
      ? enriched.requirements
      : [];

    const type: EngineJobType = enriched?.isPhD ? 'PHD' : item.inferredType;

    const deadline = enriched?.deadline ?? null;
    const postedAtIso = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();

    const { data: existing, error: existingError } = await supabase
      .from('JobOpportunity')
      .select('id')
      .eq('applicationLink', item.link)
      .limit(1);

    if (existingError) {
      console.error('Existing check error', existingError);
      continue;
    }

    const payload = {
      title: item.title,
      type,
      company: item.source.includes('nature.com') ? 'Various Universities' : 'Tech Company',
      country: country || 'Unknown',
      city: city || 'Unknown',
      description: item.description,
      requirements,
      deadline,
      postedAt: postedAtIso,
      applicationLink: item.link,
      source: item.source,
    } as Database['public']['Tables']['JobOpportunity']['Insert'];

    const { error: upsertError } = await supabase
      .from('JobOpportunity')
      .upsert(payload, { onConflict: 'applicationLink' });

    if (upsertError) {
      console.error('Upsert error', upsertError);
      continue;
    }

    results.push({
      link: item.link,
      status: existing && existing.length > 0 ? 'updated' : 'created',
    });
  }

  return results;
}
