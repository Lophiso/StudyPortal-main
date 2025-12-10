import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types';
import Parser from 'rss-parser';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const supabaseUrl = process.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY as string;
const geminiApiKey = process.env.GEMINI_API_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase env vars VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set');
}

const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

const rssParser = new Parser({
  // Make xml2js more forgiving so that bad entities like unescaped '&' don't
  // cause the entire feed to fail with "Invalid character in entity name".
  xml2js: { strict: false },
});

// 1. Global PhD & Academic Aggregators (The "Big Three" + more)
const GLOBAL_PHD_FEEDS = [
  'https://www.findaphd.com/phds/rss.aspx',
  'https://www.jobs.ac.uk/feeds/type-roles?role=PhDs',
  'https://www.academicpositions.com/rss',
  'https://www.timeshighereducation.com/unijobs/rss',
  'https://www.higheredjobs.com/rss/categoryFeed.cfm?catID=68',
];

// 2. Science, Tech & Engineering Specific (High Value)
const STEM_FEEDS = [
  'https://spectrum.ieee.org/feeds/topic/careers',
  'https://cacm.acm.org/feeds-2/',
  'https://www.nature.com/naturecareers/feed/rss',
  'https://jobs.sciencecareers.org/rss/jobs/',
  'https://www.newscientistjobs.com/jobs/rss/',
  'https://www.jobs.ac.uk/feeds/discipline/engineering',
  'https://www.jobs.ac.uk/feeds/discipline/biosciences',
];

// 3. European & National Portals (Euraxess Network)
const REGIONAL_FEEDS = [
  'https://euraxess.ec.europa.eu/jobs/rss',
  'https://www.euraxess.it/jobs/rss',
  'https://www.euraxess.fr/jobs/rss',
  'https://www.euraxess.de/jobs/rss',
  'https://www.euraxess.es/jobs/rss',
  'https://www.euraxess.nl/jobs/rss',
];

// 4. Industry / remote tech jobs (non-academic)
const INDUSTRY_FEEDS = ['https://weworkremotely.com/categories/remote-programming-jobs.rss'];

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
  language: string | null;
  summaryEn: string | null;
}

export async function runRealtimeIngestion() {
  const feedItems: FeedItem[] = [];

  const selectedFeeds: { url: string; inferredType: EngineJobType }[] = [];

  for (const url of GLOBAL_PHD_FEEDS) {
    selectedFeeds.push({ url, inferredType: 'PHD' });
  }
  for (const url of STEM_FEEDS) {
    selectedFeeds.push({ url, inferredType: 'PHD' });
  }
  for (const url of REGIONAL_FEEDS) {
    selectedFeeds.push({ url, inferredType: 'PHD' });
  }
  for (const url of INDUSTRY_FEEDS) {
    selectedFeeds.push({ url, inferredType: 'JOB' });
  }

  console.log('[realtimeFetcher] selected feeds:', selectedFeeds.map((f) => f.url));

  for (const { url, inferredType } of selectedFeeds) {
    try {
      const feed = await rssParser.parseURL(url);
      for (const item of feed.items ?? []) {
        const title = (item.title ?? '').trim();
        const link = (item.link ?? '').trim();
        if (!title || !link) continue;

        const description =
          (item.contentSnippet as string | undefined) ??
          (item['content:encoded'] as string | undefined) ??
          (item.content as string | undefined) ??
          (item.description as string | undefined) ??
          '';

        const pubDate =
          (item.isoDate as string | undefined) ??
          (item.pubDate as string | undefined) ??
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
      console.log('[realtimeFetcher] fetched', feed.items?.length ?? 0, 'items from', url);
    } catch (e) {
      console.error('[realtimeFetcher] Error parsing feed', url, e);
    }
  }

  console.log('[realtimeFetcher] total raw feed items:', feedItems.length);

  const uniqueByLink = new Map<string, FeedItem>();
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

  const results: { link: string; status: 'created' | 'updated' }[] = [];
  const skipped: { link: string; reason: string; detail?: string }[] = [];

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
  const newItems: FeedItem[] = [];

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

  const processItem = async (item: FeedItem) => {
    try {
      let enriched: GeminiEnriched | null = null;

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
            const parsed = JSON.parse(text) as Partial<GeminiEnriched>;
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
        } catch (e: any) {
          console.error('[realtimeFetcher] Gemini enrichment failed for', item.link, e?.message ?? String(e));
        }
      }

      if (!enriched) {
        // Minimal heuristic fallback if Gemini is unavailable or fails
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

      const type: EngineJobType = enriched.isPhD ? 'PHD' : item.inferredType;
      const deadline = enriched.deadline ?? null;
      const postedAtIso = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();

      const payload: Database['public']['Tables']['JobOpportunity']['Insert'] = {
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
    } catch (e: any) {
      skipped.push({ link: item.link, reason: 'ai_or_upsert_error', detail: e?.message ?? String(e) });
    }
  };

  for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
    const batch = newItems.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((item) => processItem(item)));
  }

  return { results, skipped };
}
