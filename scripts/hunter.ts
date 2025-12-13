import 'dotenv/config';
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

// Env vars: for GitHub Actions, set these as repository secrets
// SUPABASE_URL, SUPABASE_KEY (service role), GEMINI_API_KEY
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

// Hard safety limits so free-tier Gemini quota and GitHub runner time are respected
const MAX_GEMINI_CALLS_PER_RUN = 15; // keep well below the 20 free-tier limit
const MAX_ITEMS_PER_RUN = 60; // keep CI runs short by limiting deep-scraped items per run

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
      model: 'gemini-2.5-flash',
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

let geminiCallsThisRun = 0;
let geminiDisabledForRun = false;

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
  // Optional fields populated by deep scraping of the job detail page
  description?: string;
  requirements?: string[];
  city?: string | null;
  country?: string | null;
  deadline?: string | null;
}

interface EnrichedJob {
  title: string;
  company: string | null;
  isPhD: boolean;
  location: string | null;
  deadline: string | null; // ISO if known
}

function normalizeDeadline(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Accept ISO-like dates only; anything else is treated as unknown to avoid DB errors
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return null;
}

function normalizeJobTitle(raw: string): string {
  let title = (raw || '').replace(/\s+/g, ' ').trim();
  if (!title) return 'Untitled position';

  // Remove relative age markers like "19d", "2 days ago"
  title = title.replace(/\b\d+\s*(d|days? ago)\b/gi, '').trim();

  // For long titles, try to cut off at first salary or long location tail
  title = title.replace(/\b\$?\d[\d,]*(?:\s*(USD|EUR|GBP|CAD|AUD))?.*$/i, '').trim();

  // Collapse repeated spaces and commas
  title = title.replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();

  // Hard cap to 120 chars, cut at last separator if possible
  const MAX_LEN = 120;
  if (title.length > MAX_LEN) {
    const cut = title.slice(0, MAX_LEN);
    const lastSep = Math.max(cut.lastIndexOf('|'), cut.lastIndexOf('-'), cut.lastIndexOf(','));
    title = (lastSep > 40 ? cut.slice(0, lastSep) : cut).trim();
  }

  return title;
}

const GENERIC_PAGE_KEYWORDS = [
  'privacy policy',
  'terms & conditions',
  'terms and conditions',
  'contact us',
  'contact',
  'about us',
  'about',
  'imprint',
  'legal notice',
  'cookie policy',
  'cookies',
  'cookie settings',
  'cookie preferences',
  'impostazioni dei cookie',
  'data protection',
  'disclaimer',
  'sitemap',
  'accessibility',
  'skip to main content',
  'job sorting option',
  'create alert',
  'direct employer',
  'australian dollars',
  'south australia',
  'western australia',
  'new south wales',
  'login',
  'log in',
  'sign in',
  'register',
  'create account',
  'my account',
  'account settings',
  'help center',
  'support center',
];

function isGenericPageTitle(title: string): boolean {
  const text = (title || '').toLowerCase();
  if (!text) return true;

  if (GENERIC_PAGE_KEYWORDS.some((kw) => text.includes(kw))) {
    return true;
  }

  const hasOpportunityKeyword = /phd|ph\.d|doctoral|doctorate|position|studentship|fellowship|professor|lecturer|research(er)?|assistant professor|lecturer|postdoc|post-doctoral|scholarship|studentship|vacancy|opening|job|role|engineer|developer|analyst|scientist|manager|intern/i.test(
    text,
  );
  const compact = text.replace(/[^a-z0-9]+/gi, '');
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // Short titles without any opportunity keywords are almost always filters, regions, or UI labels.
  if (!hasOpportunityKeyword && (compact.length <= 12 || wordCount <= 3)) {
    return true;
  }

  return false;
}

async function analyzeWithGemini(job: RawJob): Promise<EnrichedJob> {
  // For now, avoid calling Gemini during ingestion to preserve free-tier quota
  // for detail-page summaries. Use a simple heuristic instead.
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
    title: normalizeJobTitle(enriched.title || raw.title),
    type: isPhDType ? 'PHD' : 'JOB',
    company: enriched.company || 'Unknown',
    country: raw.country || enriched.location || 'Unknown',
    city: raw.city || 'Unknown',
    description: raw.description || raw.snippet,
    requirements:
      raw.requirements && raw.requirements.length > 0
        ? raw.requirements
        : ['See full description for details.'],
    deadline: normalizeDeadline(raw.deadline ?? enriched.deadline ?? null),
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

async function enrichRawJobWithPage(page: any, job: RawJob): Promise<RawJob> {
  try {
    await page.goto(job.url, { waitUntil: 'networkidle2', timeout: 30_000 });

    const description: string | null = await page.evaluate(() => {
      const selectors = ['article', 'main', '.job-description', '.description', '.job-body', '.content'];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim().length > 200) {
          return el.textContent.trim();
        }
      }

      const bodyText = document.body?.innerText || '';
      return bodyText.trim().slice(0, 8000) || null;
    });

    const requirements: string[] = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('ul li')) as HTMLLIElement[];
      const texts = items
        .map((li) => li.innerText.trim())
        .filter((t) => t.length > 0 && t.length < 400);
      return texts.slice(0, 12);
    });

    const meta: { city: string | null; country: string | null; deadline: string | null } =
      await page.evaluate(() => {
        const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ');

        let deadline: string | null = null;
        const deadlineMatch =
          bodyText.match(/Deadline:?\s*([^\.]{5,60})/i) ||
          bodyText.match(/Closing date:?\s*([^\.]{5,60})/i);
        if (deadlineMatch) {
          deadline = deadlineMatch[1].trim();
        }

        let city: string | null = null;
        let country: string | null = null;
        const locMatch = bodyText.match(/Location:?\s*([^\.]{5,80})/i);
        if (locMatch) {
          const parts = locMatch[1].split(',').map((p) => p.trim());
          if (parts.length === 1) {
            country = parts[0] || null;
          } else if (parts.length >= 2) {
            city = parts[0] || null;
            country = parts[parts.length - 1] || null;
          }
        }

        return { city, country, deadline };
      });

    const enriched: RawJob = {
      ...job,
      description: description || job.description,
      requirements: requirements.length > 0 ? requirements : job.requirements,
      city: meta.city ?? job.city ?? null,
      country: meta.country ?? job.country ?? null,
      deadline: meta.deadline ?? job.deadline ?? null,
    };

    return enriched;
  } catch (e) {
    console.error('[hunter] Failed to enrich job page', job.url, e);
    return job;
  }
}

export async function runHunter() {
  console.log('[hunter] starting job hunter bot');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    protocolTimeout: 120_000,
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

    const filteredRaw = allRaw.filter((job) => !isGenericPageTitle(job.title));
    const uniqueRaw = dedupeRawJobs(filteredRaw);
    const toProcess = uniqueRaw.slice(0, MAX_ITEMS_PER_RUN);
    console.log('[hunter] total raw scraped items:', allRaw.length);
    console.log('[hunter] after filtering generic pages:', filteredRaw.length);
    console.log('[hunter] unique items after dedupe:', uniqueRaw.length);
    console.log('[hunter] processing up to', MAX_ITEMS_PER_RUN, 'items this run; actual:', toProcess.length);

    for (let index = 0; index < toProcess.length; index++) {
      let raw = toProcess[index];
      if (index % 10 === 0) {
        console.log(`[hunter] processing job ${index + 1} / ${toProcess.length}`);
      }

      try {
        raw = await enrichRawJobWithPage(page, raw);

        const geminiInput: RawJob = {
          ...raw,
          snippet: raw.description || raw.snippet,
        };

        const enriched = await analyzeWithGemini(geminiInput);
        await upsertJob(raw, enriched);
      } catch (e) {
        console.error('[hunter] failed to process job with Gemini, falling back to basic upsert', raw.url, e);

        const fallback: EnrichedJob = {
          title: raw.title,
          company: null,
          isPhD: /phd|ph\.d|doctoral|doctorate/i.test(`${raw.title} ${raw.snippet}`),
          location: null,
          deadline: null,
        };

        try {
          await upsertJob(raw, fallback);
        } catch (inner) {
          console.error('[hunter] fallback upsert also failed for', raw.url, inner);
        }
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
