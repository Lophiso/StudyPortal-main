import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types';
import Parser from 'rss-parser';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import * as cheerio from 'cheerio';
import { SEARCH_CONFIG } from '../searchConfig';

const geminiApiKey = process.env.GEMINI_API_KEY as string;

function createServerSupabaseClient() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) as string | undefined;
  const supabaseServiceKey = process.env.SUPABASE_KEY as string | undefined;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_KEY (service role) for ingestion');
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey);
}

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
const STEM_FEEDS: string[] = [];
const REGIONAL_FEEDS: string[] = [];

// 3. Industry / remote tech jobs (non-academic) – We Work Remotely
const INDUSTRY_FEEDS = ['https://weworkremotely.com/remote-jobs.rss'];

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
  title: string | null;
  full_title: string | null;
  card_summary: string | null;
  university: string | null;
  department: string | null;
  funding_status: string | null;
  city: string | null;
  country: string | null;
  requirements: string[];
  deadline: string | null;
  posted_date: string | null;
  isPhD: boolean;
  language: string | null;
  summaryEn: string | null;
}

function isBlockedContent(text: string) {
  const haystack = text.toLowerCase();
  return (
    haystack.includes('cloudflare') ||
    haystack.includes('security check') ||
    haystack.includes('access denied') ||
    haystack.includes('blocked')
  );
}

function looksLikeHtmlGarbage(text: string) {
  const t = text.toLowerCase();
  if (t.includes('<html') || t.includes('<body') || t.includes('<div') || t.includes('</a>')) return true;
  if (t.includes('&nbsp;') || t.includes('&amp;') || t.includes('&#')) return true;
  return false;
}

function hasTooManyNonAscii(text: string) {
  if (!text) return false;
  const total = text.length;
  if (total < 50) return false;
  let nonAscii = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) > 127) nonAscii += 1;
  }
  return nonAscii / total > 0.08;
}

function clampWords(text: string, maxWords: number) {
  const words = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

function sanitizeCardSummary(raw: string) {
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/[`*_#>\[\]]/g, '')
    .replace(/\b(apply here|apply now|click here|read more|learn more|visit)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'TBA';
  return clampWords(cleaned, 15);
}

function isRubbishTitle(title: string) {
  const t = (title || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return true;
  return (
    t.startsWith('find your ideal') ||
    t.startsWith('find your next') ||
    t.startsWith('sign up for instagram') ||
    t.startsWith('log in') ||
    t.includes('sign up') && t.includes('instagram') ||
    t.includes('join instagram') ||
    t.includes('follow') && t.includes('instagram') ||
    t.includes('close') && t.includes('instagram') ||
    t.includes('instagram.com') ||
    t.includes('facebook.com') ||
    t.includes('twitter.com') ||
    t.includes('x.com') ||
    t.includes('job search') ||
    t.includes('search results')
  );
}

function isBlacklistedHost(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return (
      host === 'instagram.com' ||
      host.endsWith('.instagram.com') ||
      host === 'facebook.com' ||
      host.endsWith('.facebook.com') ||
      host === 'm.facebook.com' ||
      host === 'twitter.com' ||
      host.endsWith('.twitter.com') ||
      host === 'x.com' ||
      host.endsWith('.x.com')
    );
  } catch {
    return false;
  }
}

function inferUniversityFromUrl(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.includes('jobs.ac.uk')) return 'Various Universities';
    const parts = host.split('.').filter(Boolean);
    if (parts.length >= 2) {
      const root = parts[parts.length - 2];
      return root.toUpperCase();
    }
    return null;
  } catch {
    return null;
  }
}

function inferUniversityFromEmail(text: string) {
  const m = text.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  if (!m) return null;
  const domain = m[1].toLowerCase();
  const parts = domain.split('.').filter(Boolean);
  if (parts.length < 2) return null;
  const root = parts[parts.length - 2];
  if (root === 'edu' && parts.length >= 3) return parts[parts.length - 3].toUpperCase();
  return root.toUpperCase();
}

function truncateTitle(title: string) {
  const cleaned = title.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 60) return cleaned;
  return cleaned.slice(0, 57).trimEnd() + '...';
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
  const ctx = t.match(
    /(deadline|closing date|apply by|applications close|application deadline)[^\n]{0,120}/,
  )?.[0];
  const scope = ctx ?? t;

  const m1 = scope.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/);
  if (m1) {
    const month = monthMap[m1[1]];
    const day = Number(m1[2]);
    const year = Number(m1[3]);
    const d = new Date(Date.UTC(year, month, day));
    if (Number.isFinite(d.getTime())) return toIsoDateString(d);
  }

  const m2 = scope.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)[,]?\s+(\d{4})\b/);
  if (m2) {
    const day = Number(m2[1]);
    const month = monthMap[m2[2]];
    const year = Number(m2[3]);
    const d = new Date(Date.UTC(year, month, day));
    if (Number.isFinite(d.getTime())) return toIsoDateString(d);
  }

  return null;
}

type GoogleCseResult = { title: string; link: string; snippet: string };

async function searchWithGoogleCse(query: string): Promise<GoogleCseResult[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;

  if (!apiKey || !cx) {
    console.warn('[realtimeFetcher] Google CSE env missing; skipping search discovery');
    return [];
  }

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', query);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.warn('[realtimeFetcher] Google CSE HTTP error', res.status);
    return [];
  }

  const data: any = await res.json();
  const items: any[] = Array.isArray(data.items) ? data.items : [];
  return items
    .map((item) => ({
      title: (item.title ?? '').toString(),
      link: (item.link ?? '').toString(),
      snippet: (item.snippet ?? '').toString(),
    }))
    .filter((r) => r.title && r.link);
}

function htmlToMarkdown(html: string, baseUrl: string) {
  const $ = cheerio.load(html);

  $('script,noscript,style,svg,iframe').remove();

  const root =
    $('main').first().length > 0
      ? $('main').first()
      : $('article').first().length > 0
        ? $('article').first()
        : $('body');

  const lines: string[] = [];

  const pushText = (text: string) => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t) return;
    lines.push(t);
  };

  root.find('h1,h2,h3,p,li,a').each((_, el) => {
    const tag = el.tagName?.toLowerCase?.() ?? '';

    if (tag === 'h1') {
      pushText(`# ${$(el).text()}`);
      lines.push('');
      return;
    }

    if (tag === 'h2') {
      pushText(`## ${$(el).text()}`);
      lines.push('');
      return;
    }

    if (tag === 'h3') {
      pushText(`### ${$(el).text()}`);
      lines.push('');
      return;
    }

    if (tag === 'li') {
      pushText(`- ${$(el).text()}`);
      return;
    }

    if (tag === 'a') {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      const href = $(el).attr('href') ?? '';
      if (!text || !href) return;
      const abs = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
      pushText(`[${text}](${abs})`);
      return;
    }

    pushText($(el).text());
    lines.push('');
  });

  const md = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return md;
}

function extractPrimaryHeading(html: string) {
  const $ = cheerio.load(html);
  const pick = (sel: string) => $(sel).first().text().replace(/\s+/g, ' ').trim();
  const h1 = pick('main h1, article h1, body h1');
  if (h1) return h1;
  const h2 = pick('main h2, article h2, body h2');
  if (h2) return h2;
  return null;
}

async function fetchMarkdownForUrl(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  const res = await fetch(
    url,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    },
  );

  clearTimeout(timeout);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const html = await res.text();
  if (isBlockedContent(html)) {
    return { markdown: null as string | null, blocked: true, pageTitle: null as string | null };
  }

  const pageTitle = extractPrimaryHeading(html);

  const markdown = htmlToMarkdown(html, url);
  if (isBlockedContent(markdown)) {
    return { markdown: null as string | null, blocked: true, pageTitle: null as string | null };
  }

  return { markdown, blocked: false, pageTitle };
}

export async function runRealtimeIngestion(options?: { includeIndustry?: boolean }) {
  const supabase = createServerSupabaseClient();
  const includeIndustry = options?.includeIndustry !== false;
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
  if (includeIndustry) {
    for (const url of INDUSTRY_FEEDS) {
      selectedFeeds.push({ url, inferredType: 'JOB' });
    }
  }

  const searchSeeds: Array<{ query: string; inferredType: EngineJobType; tag: string }> = [];
  for (const q of SEARCH_CONFIG.phdKeywords) {
    searchSeeds.push({ query: q, inferredType: 'PHD', tag: 'PHD_GLOBAL' });
  }
  for (const q of SEARCH_CONFIG.canadaPhdKeywords) {
    searchSeeds.push({ query: q, inferredType: 'PHD', tag: 'PHD_CANADA' });
  }
  if (includeIndustry) {
    for (const q of SEARCH_CONFIG.jobKeywords) {
      searchSeeds.push({ query: q, inferredType: 'JOB', tag: 'JOB_GLOBAL' });
    }
    for (const q of SEARCH_CONFIG.canadaJobKeywords) {
      searchSeeds.push({ query: q, inferredType: 'JOB', tag: 'JOB_CANADA' });
    }
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

  const cseItems: FeedItem[] = [];
  for (const seed of searchSeeds) {
    try {
      const results = await searchWithGoogleCse(seed.query);
      for (const r of results.slice(0, 5)) {
        if (!r.link || !r.title) continue;
        cseItems.push({
          title: r.title,
          link: r.link,
          description: r.snippet ?? '',
          pubDate: null,
          source: `GOOGLE_CSE_${seed.tag}`,
          inferredType: seed.inferredType,
        });
      }
    } catch (e: any) {
      console.warn('[realtimeFetcher] CSE search failed', seed.query, e?.message ?? String(e));
    }
  }

  if (cseItems.length > 0) {
    feedItems.push(...cseItems);
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
              title: { type: SchemaType.STRING, nullable: true },
              full_title: { type: SchemaType.STRING, nullable: true },
              card_summary: { type: SchemaType.STRING, nullable: true },
              university: { type: SchemaType.STRING, nullable: true },
              department: { type: SchemaType.STRING, nullable: true },
              funding_status: { type: SchemaType.STRING, nullable: true },
              city: { type: SchemaType.STRING, nullable: true },
              country: { type: SchemaType.STRING, nullable: true },
              isPhD: { type: SchemaType.BOOLEAN },
              deadline: { type: SchemaType.STRING, nullable: true },
              posted_date: { type: SchemaType.STRING, nullable: true },
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

  const MAX_AI_ITEMS = 15;
  const limitedNewItems = newItems.slice(0, MAX_AI_ITEMS);

  console.log('[realtimeFetcher] new items requiring AI:', newItems.length);
  if (newItems.length > limitedNewItems.length) {
    console.log('[realtimeFetcher] limiting AI enrichment to', limitedNewItems.length, 'items');
  }

  const BATCH_SIZE = 3;

  const processItem = async (item: FeedItem) => {
    try {
      let enriched: GeminiEnriched | null = null;

      let contentMarkdown = item.description;
      let pageTitle: string | null = null;

      if (isBlacklistedHost(item.link)) {
        skipped.push({ link: item.link, reason: 'blacklisted_host' });
        return;
      }
      try {
        const fetched = await fetchMarkdownForUrl(item.link);
        const { markdown, blocked } = fetched;
        pageTitle = fetched.pageTitle;
        if (blocked) {
          skipped.push({ link: item.link, reason: 'blocked_content' });
          return;
        }
        if (markdown) {
          contentMarkdown = markdown;
        }
      } catch (e: any) {
        console.warn('[realtimeFetcher] page fetch/markdown failed for', item.link, e?.message ?? String(e));
      }

      const sourceTitle = (pageTitle ?? item.title ?? '').toString().replace(/\s+/g, ' ').trim();
      if (isRubbishTitle(sourceTitle)) {
        skipped.push({ link: item.link, reason: 'rubbish_source_title' });
        return;
      }

      if (isBlockedContent(contentMarkdown)) {
        skipped.push({ link: item.link, reason: 'blocked_content' });
        return;
      }

      const MAX_MARKDOWN_CHARS = 12_000;
      if (contentMarkdown.length > MAX_MARKDOWN_CHARS) {
        contentMarkdown = contentMarkdown.slice(0, MAX_MARKDOWN_CHARS);
      }

      if (model) {
        try {
          const prompt = `You are enriching job and PhD opportunity posts for a database.
Analyze the following text and:
0) Rewrite the job title to be human-friendly, professional, and under 60 characters.
   Example: "PhD in Quantum Computing - MIT".
   - The title field MUST contain the human-friendly rewrite.
   - NEVER use generic site-crawler/SEO text like "Find your ideal position" as the title.
   - Preserve the original (page heading) separately as full_title.
1) Detect the main language (ISO 639-1 code if possible).
2) Provide a concise English Markdown summary (3-5 sentences + 3-5 bullet points).
3) Produce a card_summary: a 15-word hook describing the research goal (no generic "Apply" text).
4) Return a JSON object with fields:
   - title: string (max 60 characters)
   - full_title: string (original full title)
   - card_summary: string (15 words)
   - university: string (the institution/university name; do not return TBA unless truly missing)
   - department: string (e.g., "Computer Science"; use "TBA" if missing)
   - funding_status: string (e.g., "Fully Funded"; use "TBA" if missing)
   - city: string | null
   - country: string | null
   - isPhD: boolean (true if this is clearly a PhD/doctoral opportunity)
   - posted_date: YYYY-MM-DD string or null
   - deadline: YYYY-MM-DD string or null
   - requirements: string[] (short bullet-style requirement sentences)
   - language: string | null (language code or name)
   - summaryEn: string | null (concise English Markdown summary)

Important rules:
- Never return the literal string "Unknown" for any field.
- If a value is not present, return "TBA" (or null only where the schema explicitly allows null).
- If university is missing, infer it from:
  - the source domain in the URL
  - or an email address domain in the footer/contact section.
- Ignore the HTML <title> tag and SEO headers. Use the primary page heading (H1/H2) as the source for full_title.

Text:
Source title (page heading): ${sourceTitle}
Content (Markdown):
${contentMarkdown}`;

          const response = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
          });

          const text = response.response?.text();
          if (text) {
            const parsed = JSON.parse(text) as Partial<GeminiEnriched>;
            enriched = {
              title: parsed.title ?? null,
              full_title: parsed.full_title ?? null,
              card_summary: parsed.card_summary ?? null,
              university: parsed.university ?? null,
              department: parsed.department ?? null,
              funding_status: parsed.funding_status ?? null,
              city: parsed.city ?? null,
              country: parsed.country ?? null,
              isPhD: Boolean(parsed.isPhD),
              deadline: parsed.deadline ?? null,
              posted_date: parsed.posted_date ?? null,
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
          title: null,
          full_title: null,
          card_summary: null,
          university: null,
          department: null,
          funding_status: null,
          city: null,
          country: null,
          isPhD,
          deadline: null,
          posted_date: null,
          requirements: ['See full description for details.'],
          language: null,
          summaryEn: null,
        };
      }

      const city = enriched.city || '';
      const country = enriched.country || '';
      const fullTitle = (pageTitle ?? enriched.full_title ?? sourceTitle).toString().trim() || 'TBA';

      if (enriched.title && isRubbishTitle(enriched.title)) {
        skipped.push({ link: item.link, reason: 'rubbish_ai_title' });
        return;
      }

      const cleanedTitle = enriched.title ? truncateTitle(enriched.title) : truncateTitle(fullTitle);
      if (isRubbishTitle(cleanedTitle)) {
        skipped.push({ link: item.link, reason: 'rubbish_title' });
        return;
      }
      const department = (enriched.department ?? '').toString().trim() || 'TBA';
      const fundingStatus = (enriched.funding_status ?? '').toString().trim() || 'TBA';

      const inferredUniversity =
        (enriched.university ?? '').toString().trim() ||
        inferUniversityFromEmail(contentMarkdown) ||
        inferUniversityFromUrl(item.link) ||
        'TBA';

      const companyLabel = item.source.includes('weworkremotely.com') ? 'We Work Remotely' : inferredUniversity;

      const cardSummary = sanitizeCardSummary(
        (enriched.card_summary ?? '').toString().trim() || (enriched.summaryEn ?? '').toString().trim(),
      );

      if (looksLikeHtmlGarbage(enriched.summaryEn ?? '') || looksLikeHtmlGarbage(cardSummary)) {
        skipped.push({ link: item.link, reason: 'rubbish_html_summary' });
        return;
      }

      if (hasTooManyNonAscii(enriched.summaryEn ?? '') || hasTooManyNonAscii(cardSummary)) {
        skipped.push({ link: item.link, reason: 'non_english_summary' });
        return;
      }
      const requirements = enriched.requirements && enriched.requirements.length > 0
        ? enriched.requirements
        : ['See full description for details.'];

      const type: EngineJobType = enriched.isPhD ? 'PHD' : item.inferredType;

      if (!includeIndustry && type !== 'PHD') {
        skipped.push({ link: item.link, reason: 'filtered_non_phd' });
        return;
      }
      const today = toIsoDateString(new Date());
      const deadline =
        normalizeDeadline(enriched.deadline) ??
        extractDeadlineFromText(contentMarkdown) ??
        extractDeadlineFromText(item.description);

      if (!deadline) {
        skipped.push({ link: item.link, reason: 'missing_deadline' });
        return;
      }

      if (deadline < today) {
        skipped.push({ link: item.link, reason: 'expired_deadline' });
        return;
      }
      const postedIsoDate = normalizeDeadline(enriched.posted_date);
      const postedAtIso = postedIsoDate
        ? new Date(`${postedIsoDate}T00:00:00.000Z`).toISOString()
        : item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString();

      const payload: Database['public']['Tables']['JobOpportunity']['Insert'] = {
        card_summary: cardSummary,
        department,
        funding_status: fundingStatus,
        full_title: fullTitle,
        title: cleanedTitle,
        type,
        company: companyLabel,
        country: country || 'TBA',
        city: city || 'TBA',
        description: enriched.summaryEn ?? contentMarkdown,
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

  for (let i = 0; i < limitedNewItems.length; i += BATCH_SIZE) {
    const batch = limitedNewItems.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((item) => processItem(item)));
  }

  return { results, skipped };
}
