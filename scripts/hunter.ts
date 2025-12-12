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
  source:
    | 'FINDAPHD'
    | 'WWR_REMOTE'
    | 'DAAD_GERMANY'
    | 'ACADEMICTRANSFER_NL'
    | 'UAFF_CANADA'
    | 'THE_AUSTRALIA'
    | 'TALENT_IT';
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

  // Heuristic selectors: focus on links that look like individual PhD listings on findaphd.com
  const jobs: RawJob[] = await page.$$eval('a', (anchors: any[]) => {
    const items: any[] = [];
    for (const a of anchors) {
      const href = (a as HTMLAnchorElement).href;
      const text = (a.textContent || '').trim();
      if (!href || !text) continue;
      if (!href.includes('findaphd.com')) continue;
      if (!/phd|ph\.d|doctoral|doctorate/i.test(text)) continue;

      items.push({
        source: 'FINDAPHD',
        url: href,
        title: text,
        snippet: text,
      });
      if (items.length >= 40) break;
    }
    return items;
  });

  console.log('[hunter] FindAPhD raw items:', jobs.length);
  return jobs;
}

async function scrapeWeWorkRemotely(page: any): Promise<RawJob[]> {
  const url = 'https://weworkremotely.com/categories/remote-programming-jobs';
  console.log('[hunter] scraping We Work Remotely:', url);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });

  const jobs: RawJob[] = await page.$$eval('a', (anchors: any[]) => {
    const items: any[] = [];

    for (const a of anchors) {
      const href = (a as HTMLAnchorElement).href;
      const text = (a.textContent || '').trim();
      if (!href || !text) continue;
      if (!href.includes('weworkremotely.com')) continue;
      if (!/developer|engineer|software|frontend|backend|fullstack|full-stack/i.test(text)) {
        continue;
      }

      items.push({
        source: 'WWR_REMOTE',
        url: href,
        title: text,
        snippet: text,
      });

      if (items.length >= 40) break;
    }

    return items;
  });

  console.log('[hunter] WWR remote items:', jobs.length);
  return jobs;
}

async function huntPhdGermany(page: any): Promise<RawJob[]> {
  const url =
    'https://www2.daad.de/deutschland/studienangebote/international-programmes/en/result/?q=&degree%5B%5D=4';
  console.log('[hunter] scraping DAAD Germany PhDs:', url);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });

  const jobs: RawJob[] = await page.$$eval('a', (anchors: any[]) => {
    const items: any[] = [];
    for (const a of anchors) {
      const href = (a as HTMLAnchorElement).href;
      const text = (a.textContent || '').trim();
      if (!href || !text) continue;
      if (!href.includes('daad.de')) continue;

      items.push({
        source: 'DAAD_GERMANY',
        url: href,
        title: text,
        snippet: text,
      });
    }
    return items;
  });

  console.log('[hunter] DAAD Germany items:', jobs.length);
  return jobs;
}

async function huntPhdNetherlands(page: any): Promise<RawJob[]> {
  const url = 'https://www.academictransfer.com/en/jobs/?q=PhD';
  console.log('[hunter] scraping AcademicTransfer Netherlands PhDs:', url);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });

  const jobs: RawJob[] = await page.$$eval('a', (anchors: any[]) => {
    const items: any[] = [];
    for (const a of anchors) {
      const href = (a as HTMLAnchorElement).href;
      const text = (a.textContent || '').trim();
      if (!href || !text) continue;
      if (!href.includes('academictransfer.com')) continue;

      items.push({
        source: 'ACADEMICTRANSFER_NL',
        url: href,
        title: text,
        snippet: text,
      });
    }
    return items;
  });

  console.log('[hunter] AcademicTransfer NL items:', jobs.length);
  return jobs;
}

async function huntPhdCanada(page: any): Promise<RawJob[]> {
  const url = 'https://universityaffairs.ca/search-jobs/?keywords=PhD';
  console.log('[hunter] scraping University Affairs Canada PhDs:', url);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });

  const jobs: RawJob[] = await page.$$eval('a', (anchors: any[]) => {
    const items: any[] = [];
    for (const a of anchors) {
      const href = (a as HTMLAnchorElement).href;
      const text = (a.textContent || '').trim();
      if (!href || !text) continue;
      if (!href.includes('universityaffairs.ca')) continue;

      items.push({
        source: 'UAFF_CANADA',
        url: href,
        title: text,
        snippet: text,
      });
    }
    return items;
  });

  console.log('[hunter] University Affairs Canada items:', jobs.length);
  return jobs;
}

async function huntPhdAustralia(page: any): Promise<RawJob[]> {
  const url = 'https://www.timeshighereducation.com/unijobs/listings/australia/?keywords=PhD';
  console.log('[hunter] scraping THE Australia PhDs:', url);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });

  const jobs: RawJob[] = await page.$$eval('a', (anchors: any[]) => {
    const items: any[] = [];
    for (const a of anchors) {
      const href = (a as HTMLAnchorElement).href;
      const text = (a.textContent || '').trim();
      if (!href || !text) continue;
      if (!href.includes('timeshighereducation.com')) continue;

      items.push({
        source: 'THE_AUSTRALIA',
        url: href,
        title: text,
        snippet: text,
      });
    }
    return items;
  });

  console.log('[hunter] THE Australia items:', jobs.length);
  return jobs;
}

async function huntItalianTech(page: any): Promise<RawJob[]> {
  const base = 'https://it.talent.com/jobs';
  const queries = [
    'k=Cloud+Computing&l=Italy',
    'k=DevOps&l=Italy',
    'k=AI+Engineer&l=Italy',
    'k=Web+Developer&l=Italy',
    'k=Data+Analyst&l=Italy',
  ];

  const all: RawJob[] = [];

  for (const q of queries) {
    const url = `${base}?${q}`;
    console.log('[hunter] scraping Talent.com Italy jobs:', url);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });

    const jobs: RawJob[] = await page.$$eval('a', (anchors: any[]) => {
      const items: any[] = [];
      for (const a of anchors) {
        const href = (a as HTMLAnchorElement).href;
        const text = (a.textContent || '').trim();
        if (!href || !text) continue;
        if (!href.includes('talent.com')) continue;

        items.push({
          source: 'TALENT_IT',
          url: href,
          title: text,
          snippet: text,
        });
      }
      return items;
    });

    console.log('[hunter] Talent.com Italy items for query', q, ':', jobs.length);
    all.push(...jobs);
  }

  return all;
}

function dedupeRawJobs(jobs: RawJob[]): RawJob[] {
  const seen = new Set<string>();
  const result: RawJob[] = [];
  for (const job of jobs) {
    if (seen.has(job.url)) continue;
    seen.add(job.url);
    result.push(job);
  }
  return result;
}

async function upsertJob(raw: RawJob, enriched: EnrichedJob) {
  const phdSources = new Set<RawJob['source']>([
    'FINDAPHD',
    'DAAD_GERMANY',
    'ACADEMICTRANSFER_NL',
    'UAFF_CANADA',
    'THE_AUSTRALIA',
  ]);

  const isPhDType = enriched.isPhD || phdSources.has(raw.source);

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
      allRaw.push(...(await scrapeWeWorkRemotely(page)));
    } catch (e) {
      console.error('[hunter] WWR scrape failed', e);
    }

    try {
      allRaw.push(...(await huntPhdGermany(page)));
    } catch (e) {
      console.error('[hunter] DAAD Germany scrape failed', e);
    }

    try {
      allRaw.push(...(await huntPhdNetherlands(page)));
    } catch (e) {
      console.error('[hunter] AcademicTransfer NL scrape failed', e);
    }

    try {
      allRaw.push(...(await huntPhdCanada(page)));
    } catch (e) {
      console.error('[hunter] University Affairs Canada scrape failed', e);
    }

    try {
      allRaw.push(...(await huntPhdAustralia(page)));
    } catch (e) {
      console.error('[hunter] THE Australia scrape failed', e);
    }

    try {
      allRaw.push(...(await huntItalianTech(page)));
    } catch (e) {
      console.error('[hunter] Talent.com Italy scrape failed', e);
    }

    const uniqueRaw = dedupeRawJobs(allRaw);
    console.log('[hunter] total raw scraped items:', allRaw.length);
    console.log('[hunter] unique items after dedupe:', uniqueRaw.length);

    for (const raw of uniqueRaw) {
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
