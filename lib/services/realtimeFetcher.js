import { createClient } from '@supabase/supabase-js';
import { SEARCH_CONFIG } from '../searchConfig.js';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase env vars VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const ACADEMIC_FEEDS = [
  'https://www.timeshighereducation.com/unijobs/rss',
  'https://www.findaphd.com/phds/rss.aspx',
];
const TECH_FEEDS = ['https://weworkremotely.com/categories/remote-programming-jobs.rss'];

function parseSimpleRss(xml, source, inferredType) {
  const items = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i;
  const linkRegex = /<link>(.*?)<\/link>/i;
  const descRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/i;
  const dateRegex = /<pubDate>(.*?)<\/pubDate>/i;

  let match;
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

  if (items.length > 0) {
    return items;
  }

  const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
  const entryTitleRegex = /<title[^>]*>([\s\S]*?)<\/title>/i;
  const entryLinkHrefRegex = /<link[^>]*href=["']([^"']+)["'][^>]*>/i;
  const entryDescRegex = /<summary[\s\S]*?>([\s\S]*?)<\/summary>|<content[\s\S]*?>([\s\S]*?)<\/content>/i;
  const entryDateRegex = /<updated>(.*?)<\/updated>|<published>(.*?)<\/published>/i;

  while ((match = entryRegex.exec(xml))) {
    const block = match[0];
    const titleMatch = block.match(entryTitleRegex);
    const linkMatch = block.match(entryLinkHrefRegex);
    const descMatch = block.match(entryDescRegex);
    const dateMatch = block.match(entryDateRegex);

    const rawTitle = (titleMatch?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '');
    const title = rawTitle.trim();
    const link = (linkMatch?.[1] || '').trim();
    const rawDesc = (descMatch?.[1] || descMatch?.[2] || '').replace(/<!\[CDATA\[|\]\]>/g, '');
    const description = rawDesc.trim();
    const pubDate = (dateMatch?.[1] || dateMatch?.[2] || '').trim() || null;

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

async function callGemini(text) {
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
    return null;
  }

  const data = await res.json();
  const textOut = data?.candidates?.[0]?.content?.parts?.[0]?.text;
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
    return null;
  }
}

function heuristicEnrich(item) {
  const text = `${item.title}\n${item.description}`.toLowerCase();

  const isPhD = /phd|ph\.d|doctoral|doctorate/.test(text);

  let city = null;
  let country = null;

  if (/remote/.test(text)) {
    city = 'Remote';
    country = 'International';
  }

  const requirements = [];
  const parts = item.description
    .replace(/<[^>]+>/g, ' ')
    .split(/\.|\n|\r/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  for (const p of parts) {
    if (requirements.length >= 8) break;
    if (/experience|knowledge|skills|required|responsibilities|we expect/i.test(p)) {
      requirements.push(p);
    }
  }

  if (requirements.length === 0) {
    requirements.push('See full description for details.');
  }

  return {
    city,
    country,
    requirements,
    deadline: null,
    isPhD,
  };
}

export async function runRealtimeIngestion() {
  const feedItems = [];

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

  console.log('[realtimeFetcher] total raw feed items:', feedItems.length);

  const uniqueByLink = new Map();
  for (const item of feedItems) {
    if (!uniqueByLink.has(item.link)) {
      uniqueByLink.set(item.link, item);
    }
  }

  const rawItems = Array.from(uniqueByLink.values());
  console.log('[realtimeFetcher] unique items after de-dup:', rawItems.length);

  const { phdKeywords, jobKeywords } = SEARCH_CONFIG;

  for (const keyword of phdKeywords) {
    const lower = keyword.toLowerCase();
    const count = rawItems.filter((item) => {
      if (item.inferredType !== 'PHD') return false;
      const text = `${item.title} ${item.description}`.toLowerCase();
      return text.includes(lower);
    }).length;
    console.log(`[realtimeFetcher] Searching for PhD keyword "${keyword}"... Found ${count} items.`);
  }

  for (const keyword of jobKeywords) {
    const lower = keyword.toLowerCase();
    const count = rawItems.filter((item) => {
      if (item.inferredType !== 'JOB') return false;
      const text = `${item.title} ${item.description}`.toLowerCase();
      return text.includes(lower);
    }).length;
    console.log(`[realtimeFetcher] Searching for JOB keyword "${keyword}"... Found ${count} items.`);
  }

  const scored = rawItems.map((item) => {
    const text = `${item.title} ${item.description}`.toLowerCase();
    const keywords = item.inferredType === 'PHD' ? phdKeywords : jobKeywords;
    let score = 0;
    for (const kw of keywords) {
      const lower = kw.toLowerCase();
      if (text.includes(lower)) score += 1;
    }
    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const items = scored.map((s) => s.item).slice(0, 50);

  const results = [];
  const skipped = [];

  for (const item of items) {
    const enrichedFromGemini = await callGemini(item.description);
    const enriched = enrichedFromGemini ?? heuristicEnrich(item);

    const city = enriched?.city || '';
    const country = enriched?.country || '';
    const requirements = enriched?.requirements && enriched.requirements.length > 0
      ? enriched.requirements
      : [];

    const type = enriched?.isPhD ? 'PHD' : item.inferredType;

    const deadline = enriched?.deadline ?? null;
    const postedAtIso = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();

    const { data: existing, error: existingError } = await supabase
      .from('JobOpportunity')
      .select('id')
      .eq('applicationLink', item.link)
      .limit(1);

    if (existingError) {
      skipped.push({ link: item.link, reason: 'existing_check_error', detail: existingError.message });
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
    };

    const { error: upsertError } = await supabase
      .from('JobOpportunity')
      .upsert(payload, { onConflict: 'applicationLink' });

    if (upsertError) {
      skipped.push({ link: item.link, reason: 'upsert_error', detail: upsertError.message });
      continue;
    }

    results.push({
      link: item.link,
      status: existing && existing.length > 0 ? 'updated' : 'created',
    });
  }

  return { results, skipped };
}
