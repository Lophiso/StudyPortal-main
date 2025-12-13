import 'dotenv/config';
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

// Env vars: for GitHub Actions, set these as repository secrets
// SUPABASE_URL, SUPABASE_KEY (service role), GROQ_API_KEY
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_KEY;

// Hard safety limits so GitHub runner time and Groq quota are respected
const MAX_GROQ_CALLS_PER_RUN = 80;
const MAX_ITEMS_PER_RUN = 60; // keep CI runs short by limiting deep-scraped items per run

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_KEY must be set');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
let groqCallsThisRun = 0;
let groqDisabledForRun = false;

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
  isPhdArticle: boolean;
  isJob: boolean;
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

type HunterKind = 'PHD' | 'JOB' | 'ARTICLE' | 'OTHER';

async function classifyWithGroq(job: RawJob): Promise<EnrichedJob> {
  const text = `${job.title}\n${job.snippet}`;

  if (!process.env.GROQ_API_KEY || groqDisabledForRun || groqCallsThisRun >= MAX_GROQ_CALLS_PER_RUN) {
    const lower = text.toLowerCase();
    const isPhD = /phd|ph\.d|doctoral|doctorate/.test(lower);
    const looksJob = /developer|engineer|software|frontend|backend|full[- ]?stack|data scientist|analyst|manager|intern/.test(
      lower,
    );
    const isArticleLike = /how to |tips|tricks|guide|the importance|why |what i |life as a phd|doing a phd/i.test(
      lower,
    );

    const kind: HunterKind = isArticleLike ? 'ARTICLE' : isPhD ? 'PHD' : looksJob ? 'JOB' : 'OTHER';

    return {
      title: job.title,
      company: null,
      isPhD: kind === 'PHD',
      isPhdArticle: kind === 'ARTICLE',
      isJob: kind === 'JOB',
      location: null,
      deadline: null,
    };
  }

  try {
    groqCallsThisRun += 1;

    const prompt = `You classify web pages from academic and job sites.

Return a single JSON object with fields: title, kind, language.

- kind MUST be exactly one of: "PHD", "JOB", "ARTICLE", "OTHER".
- language MUST be a lowercase ISO 639-1 code like "en", "de", "it".

Special rules:
- If the page is a genuine PhD / doctoral POSITION, use kind = "PHD".
- If it is a PhD-related ARTICLE, blog or advice piece, use kind = "ARTICLE".
- If it is an industry or non-academic job, use kind = "JOB".
- Otherwise use kind = "OTHER".

URL: ${job.url}
Title: ${job.title}
Snippet: ${job.snippet}`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content:
            'You are a strict classifier that labels pages as PHD, JOB, ARTICLE, or OTHER and returns compact JSON.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: 128,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices?.[0]?.message?.content || '{}';
    let parsed: { title?: string; kind?: HunterKind; language?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    let kind: HunterKind =
      parsed.kind === 'PHD' || parsed.kind === 'JOB' || parsed.kind === 'ARTICLE' || parsed.kind === 'OTHER'
        ? parsed.kind
        : 'OTHER';

    const language = (parsed.language || '').toLowerCase();

    // For PhD positions and PhD-related articles we only accept English-language
    // content. If the language is known and not English, treat it as OTHER so
    // it is dropped before reaching Supabase.
    if ((kind === 'PHD' || kind === 'ARTICLE') && language && !language.startsWith('en')) {
      kind = 'OTHER';
    }

    const isPhD = kind === 'PHD';
    const isPhdArticle = kind === 'ARTICLE';
    const isJob = kind === 'JOB';

    return {
      title: parsed.title || job.title,
      company: null,
      isPhD,
      isPhdArticle,
      isJob,
      location: null,
      deadline: null,
    };
  } catch (e) {
    console.error('[hunter] Groq classification failed, falling back to heuristic', e);
    groqDisabledForRun = true;

    const lower = text.toLowerCase();
    const isPhD = /phd|ph\.d|doctoral|doctorate/.test(lower);
    const looksJob = /developer|engineer|software|frontend|backend|full[- ]?stack|data scientist|analyst|manager|intern/.test(
      lower,
    );
    const isArticleLike = /how to |tips|tricks|guide|the importance|why |what i |life as a phd|doing a phd/i.test(
      lower,
    );
    const kind: HunterKind = isArticleLike ? 'ARTICLE' : isPhD ? 'PHD' : looksJob ? 'JOB' : 'OTHER';

    return {
      title: job.title,
      company: null,
      isPhD: kind === 'PHD',
      isPhdArticle: kind === 'ARTICLE',
      isJob: kind === 'JOB',
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
  const payload: any = {
    title: normalizeJobTitle(enriched.title || raw.title),
    type: enriched.isPhD ? 'PHD' : 'JOB',
    isPhd: enriched.isPhD,
    isPhdArticle: enriched.isPhdArticle,
    isJob: enriched.isJob,
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

        const classifyInput: RawJob = {
          ...raw,
          snippet: raw.description || raw.snippet,
        };

        const enriched = await classifyWithGroq(classifyInput);

        // Skip obvious non-opportunities
        if (!enriched.isPhD && !enriched.isPhdArticle && !enriched.isJob) {
          console.log('[hunter] skipping non-opportunity', raw.url);
          continue;
        }

        await upsertJob(raw, enriched);
      } catch (e) {
        console.error('[hunter] failed to process job with Groq/heuristics', raw.url, e);
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
