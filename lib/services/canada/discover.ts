import * as cheerio from 'cheerio';
import type { CanadaProgramType } from '../../../src/lib/canada/constants';
import { canadaSupabase } from './db';
import type { CanadaSourceRow } from './types';
import { CanadaHttpClient } from './http';
import { buildOpportunityFromHtml } from './extract';
import { computeContentHash, resolveUrl } from './content';
import { safetyGate } from './safetyGate';

function sameHost(a: string, b: string) {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}

function urlAllowed(url: string, source: CanadaSourceRow) {
  const path = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return '';
    }
  })();

  if (source.block_paths.some((p) => p && path.startsWith(p))) return false;
  if (source.allow_paths.length === 0) return true;
  return source.allow_paths.some((p) => p && path.startsWith(p));
}

function extractLinks(html: string, baseUrl: string) {
  const $ = cheerio.load(html);
  const out: string[] = [];
  for (const el of $('a[href]').toArray()) {
    const href = $(el).attr('href');
    if (!href) continue;
    const abs = resolveUrl(baseUrl, href);
    if (!abs) continue;
    out.push(abs);
  }
  return out;
}

async function fetchAndUpsertOne(args: {
  programType: CanadaProgramType;
  source: CanadaSourceRow;
  url: string;
  http: CanadaHttpClient;
}) {
  const supabase = canadaSupabase();

  const fetched = await args.http.fetchPage({
    url: args.url,
    canonicalUrl: args.url,
    timeoutMs: 20_000,
    minDelayMs: args.source.min_delay_ms,
    maxBytes: 450_000,
    conditional: { etag: null, lastModified: null },
    respectRobots: args.source.respect_robots,
  });

  await supabase.from('canada_fetch_logs').insert({
    action: 'DISCOVER',
    status: fetched.status,
    program_type: args.programType,
    source_id: args.source.id,
    canonical_url: args.url,
    fetched_url: fetched.fetchedUrl,
    http_status: fetched.httpStatus,
    elapsed_ms: fetched.elapsedMs,
    response_bytes: fetched.responseBytes,
    etag: fetched.etag,
    page_last_modified: fetched.lastModified,
    content_hash: fetched.bodyText ? computeContentHash(fetched.bodyText.slice(0, 20000)) : null,
    blocked_reason: fetched.blockedReason,
    error_message: fetched.errorMessage,
  });

  if (fetched.status !== 'OK' || !fetched.bodyText) {
    return { accepted: 0, blocked: fetched.status === 'BLOCKED' ? 1 : 0, expired: 0 };
  }

  const built = buildOpportunityFromHtml({
    programType: args.programType,
    canonicalUrl: args.url,
    sourceUrl: args.source.base_url,
    html: fetched.bodyText,
    etag: fetched.etag,
    lastModified: fetched.lastModified,
  });

  const decision = safetyGate({
    blocked: false,
    loginWall: false,
    applicationUrl: built.appUrl,
    deadlineDate: built.deadline.date,
    deadlineConfidence: built.deadline.confidence,
  });

  const payload = {
    program_type: args.programType,
    country: 'Canada',
    province: null,
    city: null,
    institution_name: built.institution,
    department: null,
    lab_group: null,
    title_clean: built.titleClean,
    nutshell_15_words: built.nutshell,
    funding_type: built.funding.type,
    funding_confidence: built.funding.confidence,
    funding_evidence: built.funding.evidence,
    international_allowed: built.intl.allowed,
    eligibility_confidence: built.intl.confidence,
    eligibility_notes: null,
    eligibility_evidence: built.intl.evidence,
    start_term: built.startTerm,
    deadline_date: built.deadline.date,
    deadline_confidence: built.deadline.confidence,
    deadline_evidence: built.deadline.evidence,
    application_url: built.appUrl ?? args.url,
    source_url: args.source.base_url,
    canonical_url: args.url,
    last_verified_at: new Date().toISOString(),
    freshness_score: 80,
    status: decision.status,
    status_reason: decision.reason,
    content_hash: built.contentHash,
    page_last_modified: built.pageLastModified,
    etag: built.etag,
  };

  const { error: upsertError } = await supabase
    .from('canada_opportunity')
    .upsert(payload, { onConflict: 'canonical_url,program_type' });

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  return {
    accepted: decision.status === 'ACTIVE' || decision.status === 'NEEDS_REVIEW' ? 1 : 0,
    blocked: decision.status === 'BLOCKED' ? 1 : 0,
    expired: decision.status === 'EXPIRED' ? 1 : 0,
  };
}

async function upsertFromHtml(args: {
  programType: CanadaProgramType;
  source: CanadaSourceRow;
  url: string;
  html: string;
  etag: string | null;
  lastModified: string | null;
}) {
  const supabase = canadaSupabase();

  const built = buildOpportunityFromHtml({
    programType: args.programType,
    canonicalUrl: args.url,
    sourceUrl: args.source.base_url,
    html: args.html,
    etag: args.etag,
    lastModified: args.lastModified,
  });

  const decision = safetyGate({
    blocked: false,
    loginWall: false,
    applicationUrl: built.appUrl,
    deadlineDate: built.deadline.date,
    deadlineConfidence: built.deadline.confidence,
  });

  const payload = {
    program_type: args.programType,
    country: 'Canada',
    province: null,
    city: null,
    institution_name: built.institution,
    department: null,
    lab_group: null,
    title_clean: built.titleClean,
    nutshell_15_words: built.nutshell,
    funding_type: built.funding.type,
    funding_confidence: built.funding.confidence,
    funding_evidence: built.funding.evidence,
    international_allowed: built.intl.allowed,
    eligibility_confidence: built.intl.confidence,
    eligibility_notes: null,
    eligibility_evidence: built.intl.evidence,
    start_term: built.startTerm,
    deadline_date: built.deadline.date,
    deadline_confidence: built.deadline.confidence,
    deadline_evidence: built.deadline.evidence,
    application_url: built.appUrl ?? args.url,
    source_url: args.source.base_url,
    canonical_url: args.url,
    last_verified_at: new Date().toISOString(),
    freshness_score: 80,
    status: decision.status,
    status_reason: decision.reason,
    content_hash: built.contentHash,
    page_last_modified: built.pageLastModified,
    etag: built.etag,
  };

  const { error: upsertError } = await supabase
    .from('canada_opportunity')
    .upsert(payload, { onConflict: 'canonical_url,program_type' });

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  return {
    accepted: decision.status === 'ACTIVE' || decision.status === 'NEEDS_REVIEW' ? 1 : 0,
    blocked: decision.status === 'BLOCKED' ? 1 : 0,
    expired: decision.status === 'EXPIRED' ? 1 : 0,
  };
}

export async function runCanadaDiscover(programType?: CanadaProgramType) {
  const supabase = canadaSupabase();
  const http = new CanadaHttpClient();

  const { data: sources, error } = await supabase
    .from('canada_sources')
    .select('*')
    .eq('active', true)
    .returns<CanadaSourceRow[]>();

  if (error) throw new Error(error.message);

  const filteredSources = (sources ?? []).filter((s) => !programType || s.program_type === programType);

  const summary = { sources: filteredSources.length, urlsVisited: 0, accepted: 0, blocked: 0, expired: 0 };

  for (const source of filteredSources) {
    summary.urlsVisited += 1;

    const fetched = await http.fetchPage({
      url: source.base_url,
      canonicalUrl: source.base_url,
      timeoutMs: 20_000,
      minDelayMs: source.min_delay_ms,
      maxBytes: 450_000,
      conditional: { etag: null, lastModified: null },
      respectRobots: source.respect_robots,
    });

    await supabase.from('canada_fetch_logs').insert({
      action: 'DISCOVER',
      status: fetched.status,
      program_type: source.program_type,
      source_id: source.id,
      canonical_url: source.base_url,
      fetched_url: fetched.fetchedUrl,
      http_status: fetched.httpStatus,
      elapsed_ms: fetched.elapsedMs,
      response_bytes: fetched.responseBytes,
      etag: fetched.etag,
      page_last_modified: fetched.lastModified,
      content_hash: fetched.bodyText ? computeContentHash(fetched.bodyText.slice(0, 20000)) : null,
      blocked_reason: fetched.blockedReason,
      error_message: fetched.errorMessage,
    });

    if (fetched.status !== 'OK' || !fetched.bodyText) {
      continue;
    }

    const baseStats = await upsertFromHtml({
      programType: source.program_type,
      source,
      url: source.base_url,
      html: fetched.bodyText,
      etag: fetched.etag,
      lastModified: fetched.lastModified,
    });
    summary.accepted += baseStats.accepted;
    summary.blocked += baseStats.blocked;
    summary.expired += baseStats.expired;

    const links = extractLinks(fetched.bodyText, source.base_url)
      .filter((u) => sameHost(u, source.base_url))
      .filter((u) => urlAllowed(u, source));

    const unique = Array.from(new Set(links)).slice(0, source.max_requests_per_run);

    for (const url of unique) {
      summary.urlsVisited += 1;
      const stats = await fetchAndUpsertOne({ programType: source.program_type, source, url, http });
      summary.accepted += stats.accepted;
      summary.blocked += stats.blocked;
      summary.expired += stats.expired;
    }
  }

  return summary;
}
