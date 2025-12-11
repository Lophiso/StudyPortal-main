import 'dotenv/config';
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

// Env vars: for GitHub Actions, set these as repository secrets
// SUPABASE_URL, SUPABASE_KEY (service role), GEMINI_API_KEY
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_KEY must be set');
}
if (!geminiApiKey) {
  console.warn('[hunter] GEMINI_API_KEY not set, running without AI enrichment');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const geminiModel = genAI
  ? genAI.getGenerativeModel({
      model: 'gemini-1.5-flash-latest',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING },
            company: { type: SchemaType.STRING, nullable: true },
            isPhD: { type: SchemaType.BOOLEAN },
            location: { type: SchemaType.STRING, nullable: true },
            deadline: { type: SchemaType.STRING, nullable: true },
          },
          required: ['title', 'isPhD'],
        },
      },
    })
  : null;

interface RawJob {
  source: 'FINDAPHD' | 'REMOTE_SEARCH';
  url: string;
  title: string;
  snippet: string;
}

interface EnrichedJob {
  title: string;
  company: string | null;
  isPhD: boolean;
  location: string | null;
  deadline: string | null; // ISO if known
}

async function analyzeWithGemini(job: RawJob): Promise<EnrichedJob> {
  if (!geminiModel) {
    const text = `${job.title}\n${job.snippet}`.toLowerCase();
    const isPhD = /phd|ph\.d|doctoral|doctorate/.test(text);
    return {
      title: job.title,
      company: null,
      isPhD,
      location: null,
      deadline: null,
    };
  }

  const prompt = `You are helping to normalize job and PhD opportunities for a database.
From the following text, extract:
- title: cleaned title string
- company: employer or university (string or null)
- isPhD: boolean (true if clearly a PhD / doctoral opportunity)
- location: city and country if possible (string or null)
- deadline: application deadline as ISO8601 (YYYY-MM-DD) if present, else null.

Return JSON only.

Text:
Title: ${job.title}
Snippet: ${job.snippet}`;

  const res = await geminiModel.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  const text = res.response?.text();
  if (!text) {
    return {
      title: job.title,
      company: null,
      isPhD: false,
      location: null,
      deadline: null,
    };
  }

  try {
    const parsed = JSON.parse(text) as Partial<EnrichedJob>;
    return {
      title: parsed.title ?? job.title,
      company: parsed.company ?? null,
      isPhD: Boolean(parsed.isPhD),
      location: parsed.location ?? null,
      deadline: parsed.deadline ?? null,
    };
  } catch (e) {
    console.error('[hunter] Failed to parse Gemini JSON for', job.url, e);
    return {
      title: job.title,
      company: null,
      isPhD: false,
      location: null,
      deadline: null,
    };
  }
}

async function scrapeFindAPhD(page: any): Promise<RawJob[]> {
  const url = 'https://www.findaphd.com/phds/latest/';
  console.log('[hunter] scraping FindAPhD latest:', url);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });

  // Heuristic selectors based on FindAPhD layout: titles are usually links inside result cards
  const jobs: RawJob[] = await page.$$eval('a', (anchors: any[]) => {
    const items: any[] = [];
    for (const a of anchors) {
      const href = (a as HTMLAnchorElement).href;
      const text = (a.textContent || '').trim();
      if (!href || !text) continue;
      // Only keep obvious PhD listing links
      if (!/phd|ph\.d|doctorate/i.test(text)) continue;

      items.push({
        source: 'FINDAPHD',
        url: href,
        title: text,
        snippet: text,
      });
      if (items.length >= 25) break;
    }
    return items;
  });

  console.log('[hunter] FindAPhD raw items:', jobs.length);
  return jobs;
}

async function scrapeRemoteSearch(page: any): Promise<RawJob[]> {
  const url = 'https://www.google.com/search?q=remote+developer+jobs&ibp=htl;jobs';
  console.log('[hunter] scraping remote dev search:', url);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });

  // Google Jobs is heavily dynamic and may not render without full interaction or may block automation;
  // as a conservative fallback, just grab visible job-like links containing "Developer" or "Engineer".
  const jobs: RawJob[] = await page.$$eval('a', (anchors) => {
    const items: RawJob[] = [] as any;
    for (const a of anchors) {
      const href = (a as HTMLAnchorElement).href;
      const text = (a.textContent || '').trim();
      if (!href || !text) continue;
      if (!/developer|engineer/i.test(text)) continue;

      items.push({
        source: 'REMOTE_SEARCH',
        url: href,
        title: text,
        snippet: text,
      });
      if (items.length >= 25) break;
    }
    return items;
  });

  console.log('[hunter] remote search raw items:', jobs.length);
  return jobs;
}

async function upsertJob(raw: RawJob, enriched: EnrichedJob) {
  const isPhDType = enriched.isPhD || raw.source === 'FINDAPHD';

  const payload: any = {
    title: enriched.title || raw.title,
    type: isPhDType ? 'PHD' : 'JOB',
    company: enriched.company || 'Unknown',
    country: enriched.location || 'Unknown',
    city: 'Unknown',
    description: raw.snippet,
    requirements: ['See full description for details.'],
    deadline: enriched.deadline ?? null,
    postedAt: new Date().toISOString(),
    applicationLink: raw.url,
    source: raw.source,
  };

  const { error } = await supabase
    .from('JobOpportunity')
    .upsert(payload, { onConflict: 'applicationLink' });

  if (error) {
    console.error('[hunter] upsert error for', raw.url, error.message);
  }
}

export async function runHunter() {
  console.log('[hunter] starting job hunter bot');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    const allRaw: RawJob[] = [];

    try {
      allRaw.push(...(await scrapeFindAPhD(page)));
    } catch (e) {
      console.error('[hunter] FindAPhD scrape failed', e);
    }

    try {
      allRaw.push(...(await scrapeRemoteSearch(page)));
    } catch (e) {
      console.error('[hunter] remote search scrape failed', e);
    }

    console.log('[hunter] total raw scraped items:', allRaw.length);

    for (const raw of allRaw) {
      try {
        const enriched = await analyzeWithGemini(raw);
        await upsertJob(raw, enriched);
      } catch (e) {
        console.error('[hunter] failed to process job', raw.url, e);
      }
    }

    console.log('[hunter] completed run');
  } finally {
    await browser.close();
  }
}

// Always run when this script is executed (GitHub Actions will call `npx tsx scripts/hunter.ts`)
runHunter().catch((e) => {
  console.error('[hunter] fatal error', e);
  process.exitCode = 1;
});
