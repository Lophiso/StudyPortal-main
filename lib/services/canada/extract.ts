import * as cheerio from 'cheerio';
import type {
  CanadaConfidence,
  CanadaFundingType,
  CanadaProgramType,
  CanadaTriState,
} from '../../../src/lib/canada/constants';
import { computeContentHash, extractH1, extractText, resolveUrl } from './content';

function takeWords(text: string, maxWords: number) {
  const parts = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.trim().length > 0);
  return parts.slice(0, maxWords).join(' ');
}

export function inferInstitutionFromUrl(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const parts = host.split('.');
    if (parts.length >= 2) return parts[0].toUpperCase();
    return host.toUpperCase();
  } catch {
    return 'TBA';
  }
}

export function extractDeadline(text: string): { date: string | null; confidence: CanadaConfidence; evidence: string | null } {
  const t = text;
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (iso) return { date: iso, confidence: 'HIGH', evidence: takeWords(`Deadline ${iso}`, 20) };

  const m = t.match(
    /(deadline|closing date|apply by|applications close|application deadline)[^\n]{0,160}/i,
  )?.[0];
  if (!m) return { date: null, confidence: 'LOW', evidence: null };

  const parsed = new Date(m);
  if (!Number.isFinite(parsed.getTime())) {
    return { date: null, confidence: 'LOW', evidence: takeWords(m, 20) };
  }

  const y = parsed.getUTCFullYear();
  const mo = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const d = String(parsed.getUTCDate()).padStart(2, '0');
  return { date: `${y}-${mo}-${d}`, confidence: 'MEDIUM', evidence: takeWords(m, 20) };
}

export function extractFunding(text: string): { type: CanadaFundingType; confidence: CanadaConfidence; evidence: string | null } {
  const t = text.toLowerCase();
  if (/(fully funded|full funding|tuition waiver|stipend)/.test(t)) {
    return { type: 'FUNDED', confidence: 'MEDIUM', evidence: takeWords('Fully funded / stipend', 20) };
  }
  if (/(partially funded|partial funding)/.test(t)) {
    return { type: 'PARTIALLY_FUNDED', confidence: 'MEDIUM', evidence: takeWords('Partially funded', 20) };
  }
  if (/(external funding|bring your own funding|tri-council|nsERC|sshRC|ciHR)/i.test(text)) {
    return { type: 'EXTERNAL_FUNDING_OK', confidence: 'MEDIUM', evidence: takeWords('External funding accepted', 20) };
  }
  if (/(self-funded|self funded)/.test(t)) {
    return { type: 'SELF_FUNDED_OK', confidence: 'MEDIUM', evidence: takeWords('Self-funded possible', 20) };
  }
  return { type: 'UNKNOWN', confidence: 'LOW', evidence: null };
}

export function extractInternationalEligibility(text: string): { allowed: CanadaTriState; confidence: CanadaConfidence; evidence: string | null } {
  const t = text.toLowerCase();
  if (/(international applicants (are )?welcome|open to international applicants)/.test(t)) {
    return { allowed: 'YES', confidence: 'MEDIUM', evidence: takeWords('International applicants welcome', 20) };
  }
  if (/(canadian citizens|permanent residents only|must be eligible to work in canada)/.test(t)) {
    return { allowed: 'NO', confidence: 'MEDIUM', evidence: takeWords('Citizens/PR only', 20) };
  }
  return { allowed: 'UNKNOWN', confidence: 'LOW', evidence: null };
}

export function extractStartTerm(text: string): string | null {
  const m = text.match(/\b(Fall|Winter|Summer)\s+(20\d{2})\b/i);
  if (!m) return null;
  return `${m[1]} ${m[2]}`;
}

export function extractApplicationUrl(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  const anchors = $('a[href]')
    .toArray()
    .map((el) => {
      const href = $(el).attr('href');
      if (!href) return null;
      const abs = resolveUrl(baseUrl, href);
      if (!abs) return null;
      const text = $(el).text().replace(/\s+/g, ' ').trim().toLowerCase();
      return { abs, text };
    })
    .filter((v): v is { abs: string; text: string } => Boolean(v));

  const preferred = anchors.find((a) => a.text.includes('apply') || a.text.includes('application'));
  if (preferred) return preferred.abs;

  const first = anchors[0];
  return first ? first.abs : null;
}

export function buildOpportunityFromHtml(args: {
  programType: CanadaProgramType;
  canonicalUrl: string;
  sourceUrl: string;
  html: string;
  etag: string | null;
  lastModified: string | null;
}) {
  const h1 = extractH1(args.html);
  const text = extractText(args.html);
  const core = `${h1 ?? ''}\n${text}`.trim();
  const contentHash = computeContentHash(core.slice(0, 20000));

  const titleClean = (h1 ?? '').trim() || takeWords(text, 10) || 'Opportunity';
  const nutshell = takeWords(text, 15) || 'See source for details.';

  const deadline = extractDeadline(text);
  const funding = extractFunding(text);
  const intl = extractInternationalEligibility(text);
  const startTerm = extractStartTerm(text);
  const appUrl = extractApplicationUrl(args.html, args.canonicalUrl);

  return {
    contentHash,
    titleClean,
    nutshell,
    deadline,
    funding,
    intl,
    startTerm,
    appUrl,
    institution: inferInstitutionFromUrl(args.canonicalUrl),
    pageLastModified: args.lastModified,
    etag: args.etag,
  };
}
