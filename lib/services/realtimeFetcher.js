import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase env vars VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const rssParser = new Parser();

const ACADEMIC_FEEDS = [
  'https://www.timeshighereducation.com/unijobs/rss',
  'https://www.findaphd.com/phds/rss.aspx',
];
const TECH_FEEDS = ['https://weworkremotely.com/categories/remote-programming-jobs.rss'];

export async function runRealtimeIngestion() {
  /** @type {{ title: string; link: string; description: string; pubDate: string | null; source: string; inferredType: 'PHD' | 'JOB'; }[]} */
  const feedItems = [];

  const feedConfigs = [
    ...ACADEMIC_FEEDS.map((url) => ({ url, inferredType: 'PHD' })),
    ...TECH_FEEDS.map((url) => ({ url, inferredType: 'JOB' })),
  ];

  for (const { url, inferredType } of feedConfigs) {
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
    } catch (e) {
      console.error('[realtimeFetcher] Error parsing feed', url, e);
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

  // Limit to top 10 newest items per run to respect Vercel timeouts
  items = items.slice(0, 10);

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
Return a JSON object with fields: city (string or null), country (string or null), isPhD (boolean), deadline (ISO8601 string or null), requirements (array of short requirement strings).

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
