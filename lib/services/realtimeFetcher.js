import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import * as cheerio from 'cheerio';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

const resolvedUrl = supabaseUrl || 'http://localhost:54321';
const resolvedAnonKey = supabaseAnonKey || 'public-anon-key-not-configured';

const supabase = createClient(resolvedUrl, resolvedAnonKey);
const rssParser = new Parser({
  // Make xml2js more forgiving so that bad entities like unescaped '&' don't
  // cause the entire feed to fail with "Invalid character in entity name".
  xml2js: { strict: false },
  requestOptions: {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  },
});

// 1. Core academic / PhD feeds from jobs.ac.uk (location-based RSS)
// See https://www.jobs.ac.uk/feeds/locations for the pattern: /jobs/<region>/?format=rss
const GLOBAL_PHD_FEEDS = [
  'https://www.jobs.ac.uk/jobs/europe/?format=rss',
  'https://www.jobs.ac.uk/jobs/london/?format=rss',
  'https://www.jobs.ac.uk/jobs/scotland/?format=rss',
];

// 2. STEM / regional feeds – unused for now (kept as empty arrays for future extension)
const STEM_FEEDS = [];
const REGIONAL_FEEDS = [];

// 3. Industry / remote tech jobs (non-academic) – We Work Remotely
const INDUSTRY_FEEDS = ['https://weworkremotely.com/remote-jobs.rss'];

/**
 * Fallback HTML parser for future high-value university pages.
 * Tries to extract a basic list of { title, link, description, pubDate } from
 * non-RSS HTML responses using cheerio. Currently unused, but ready to be
 * wired for e.g. Nottingham / KU Leuven if they cannot be accessed via RSS.
 */
async function parseHtmlFallback(url, inferredType) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  });

  if (!res.ok) {
    console.error('[realtimeFetcher] HTML fallback fetch failed', url, res.status);
    return [];
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const items = [];

  // Very generic fallback: look for anchors in list-like containers.
  $('a').each((_, el) => {
    const title = $(el).text().trim();
    const href = $(el).attr('href') || '';
    if (!title || !href) return;

    const link = href.startsWith('http') ? href : new URL(href, url).toString();

    items.push({
      title,
      link,
      description: title,
      pubDate: null,
      source: url,
      inferredType,
    });
  });

  console.log('[realtimeFetcher] html fallback extracted', items.length, 'items from', url);
  return items;
}

export async function runRealtimeIngestion(options) {
  const includeIndustry = (options?.includeIndustry) !== false;
  const feedItems = [];

  /** @type {{ url: string; inferredType: 'PHD' | 'JOB'; }[]} */
  const selectedFeeds = [];

  for (const url of GLOBAL_PHD_FEEDS) {
    selectedFeeds.push({ url, inferredType: 'PHD' });
  }
  for (const url of STEM_FEEDS) {
    selectedFeeds.push({ url, inferredType: 'PHD' });
  }
  for (const url of REGIONAL_FEEDS) {
    selectedFeeds.push({ url, inferredType: 'PHD' });
  }
  if (includeIndustry) {
    for (const url of INDUSTRY_FEEDS) {
      selectedFeeds.push({ url, inferredType: 'JOB' });
    }
  }

  console.log('[realtimeFetcher] selected feeds:', selectedFeeds.map((f) => f.url));

  for (const { url, inferredType } of selectedFeeds) {
    try {
      let parsedCount = 0;

      // First attempt: treat as a real RSS/Atom feed
      try {
        const feed = await rssParser.parseURL(url);
        for (const item of feed.items ?? []) {
          const title = (item.title ?? '').trim();
          const link = (item.link ?? '').trim();
          if (!title || !link) continue;

          const description =
            item.contentSnippet ??
            item['content:encoded'] ??
            item.content ??
            item.description ??
            '';

          const pubDate =
            item.isoDate ??
            item.pubDate ??
            null;

          feedItems.push({
            title,
            link,
            description,
            pubDate,
            source: url,
            inferredType,
          });
        }
        parsedCount = (feed.items ?? []).length;
        console.log('[realtimeFetcher] fetched', parsedCount, 'items from', url, 'via RSS');
      } catch (rssError) {
        console.error('[realtimeFetcher] RSS parse failed for', url, rssError);
      }

      // If RSS parsing failed or yielded zero items, fall back to HTML scraping
      if (parsedCount === 0) {
        const htmlItems = await parseHtmlFallback(url, inferredType);
        for (const item of htmlItems) {
          feedItems.push(item);
        }
      }
    } catch (e) {
      console.error('[realtimeFetcher] Error processing feed (rss+html)', url, e);
    }
  }

  console.log('[realtimeFetcher] total raw feed items:', feedItems.length);

  const uniqueByLink = new Map();
  for (const item of feedItems) {
    if (!uniqueByLink.has(item.link)) {
      uniqueByLink.set(item.link, item);
    }
  }

  let items = Array.from(uniqueByLink.values());

  items.sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return tb - ta;
  });

  // Limit to top 50 newest items per run while still respecting Vercel timeouts
  items = items.slice(0, 50);

  console.log('[realtimeFetcher] unique items after de-dup & trim:', items.length);

  /** @type {{ link: string; status: 'created' | 'updated'; }[]} */
  const results = [];
  /** @type {{ link: string; reason: string; detail?: string }[]} */
  const skipped = [];

  if (!geminiApiKey) {
    console.warn('[realtimeFetcher] GEMINI_API_KEY not set, skipping AI enrichment');
  }

  const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
  const model = genAI
    ? genAI.getGenerativeModel({
        model: 'gemini-1.5-flash-latest',
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              city: { type: SchemaType.STRING, nullable: true },
              country: { type: SchemaType.STRING, nullable: true },
              isPhD: { type: SchemaType.BOOLEAN },
              deadline: { type: SchemaType.STRING, nullable: true },
              requirements: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.STRING },
              },
              language: { type: SchemaType.STRING, nullable: true },
              summaryEn: { type: SchemaType.STRING, nullable: true },
            },
            required: ['isPhD'],
          },
        },
      })
    : null;

  // First, check Supabase for existing links to avoid unnecessary Gemini calls
  const newItems = [];

  for (const item of items) {
    const { data: existing, error: existingError } = await supabase
      .from('JobOpportunity')
      .select('id')
      .eq('applicationLink', item.link)
      .limit(1);

    if (existingError) {
      skipped.push({ link: item.link, reason: 'existing_check_error', detail: existingError.message });
      continue;
    }

    if (existing && existing.length > 0) {
      // Already in DB, mark as updated but skip Gemini to save latency and cost
      results.push({ link: item.link, status: 'updated' });
      continue;
    }

    newItems.push(item);
  }

  console.log('[realtimeFetcher] new items requiring AI:', newItems.length);

  const BATCH_SIZE = 3;

  const processItem = async (item) => {
    try {
      let enriched = null;

      if (model) {
        try {
          const prompt = `You are enriching job and PhD opportunity posts for a database.
Analyze the following text and:
1) Detect the main language (ISO 639-1 code if possible).
2) If the text is not primarily in English, provide a brief 1-2 sentence English summary.
3) Return a JSON object with fields:
   - city: string | null
   - country: string | null
   - isPhD: boolean (true if this is clearly a PhD/doctoral opportunity)
   - deadline: ISO8601 string or null
   - requirements: string[] (short bullet-style requirement sentences)
   - language: string | null (language code or name)
   - summaryEn: string | null (English summary or null if already English)

Text:
Title: ${item.title}
Description: ${item.description}`;

          const response = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
          });

          const text = response.response?.text();
          if (text) {
            const parsed = JSON.parse(text);
            enriched = {
              city: parsed.city ?? null,
              country: parsed.country ?? null,
              isPhD: Boolean(parsed.isPhD),
              deadline: parsed.deadline ?? null,
              requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
              language: parsed.language ?? null,
              summaryEn: parsed.summaryEn ?? null,
            };
          }
        } catch (e) {
          console.error('[realtimeFetcher] Gemini enrichment failed for', item.link, e?.message ?? String(e));
        }
      }

      if (!enriched) {
        const text = `${item.title}\n${item.description}`.toLowerCase();
        const isPhD = /phd|ph\.d|doctoral|doctorate/.test(text);
        enriched = {
          city: null,
          country: null,
          isPhD,
          deadline: null,
          requirements: ['See full description for details.'],
          language: null,
          summaryEn: null,
        };
      }

      const city = enriched.city || '';
      const country = enriched.country || '';
      const requirements = enriched.requirements && enriched.requirements.length > 0
        ? enriched.requirements
        : ['See full description for details.'];

      const type = enriched.isPhD ? 'PHD' : item.inferredType;
      const deadline = enriched.deadline ?? null;
      const postedAtIso = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();

      const payload = {
        title: item.title,
        type,
        company: item.source.includes('weworkremotely.com')
          ? 'We Work Remotely'
          : item.source.includes('timeshighereducation.com') || item.source.includes('findaphd.com')
          ? 'Various Universities'
          : 'Unknown',
        country: country || 'Unknown',
        city: city || 'Unknown',
        description: enriched.summaryEn ?? item.description,
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
        return;
      }

      results.push({ link: item.link, status: 'created' });
    } catch (e) {
      skipped.push({ link: item.link, reason: 'ai_or_upsert_error', detail: e?.message ?? String(e) });
    }
  };

  for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
    const batch = newItems.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((item) => processItem(item)));
  }

  return { results, skipped };
}
