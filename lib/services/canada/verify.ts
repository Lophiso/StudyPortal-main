import type { CanadaProgramType } from '../../../src/lib/canada/constants';
import { canadaSupabase } from './db';
import { CanadaHttpClient } from './http';
import { buildOpportunityFromHtml } from './extract';
import { computeContentHash, looksBlocked, looksLikeLoginWall } from './content';
import { safetyGate } from './safetyGate';
import type { Database } from '../../../src/lib/database.types';

function freshnessScoreFromHours(hours: number) {
  const score = 100 - Math.floor(hours * 5);
  return Math.max(0, Math.min(100, score));
}

export async function runCanadaVerify(args?: { programType?: CanadaProgramType; limit?: number }) {
  const limit = args?.limit ?? 25;
  const supabase = canadaSupabase();
  const http = new CanadaHttpClient();

  type OpportunityRow = Database['public']['Tables']['canada_opportunity']['Row'];

  let query = supabase
    .from('canada_opportunity')
    .select('*')
    .in('status', ['ACTIVE', 'NEEDS_REVIEW', 'BLOCKED'])
    .order('last_verified_at', { ascending: true })
    .limit(limit);

  if (args?.programType) {
    query = query.eq('program_type', args.programType);
  }

  const { data: rows, error } = await query.returns<OpportunityRow[]>();
  if (error) throw new Error(error.message);

  const now = new Date();
  const summary = { checked: 0, updated: 0, notModified: 0, blocked: 0, errors: 0 };

  for (const row of rows ?? []) {
    summary.checked += 1;

    const fetched = await http.fetchPage({
      url: row.canonical_url,
      canonicalUrl: row.canonical_url,
      timeoutMs: 20_000,
      minDelayMs: 900,
      maxBytes: 450_000,
      conditional: { etag: row.etag ?? null, lastModified: row.page_last_modified ?? null },
      respectRobots: false,
    });

    await supabase.from('canada_fetch_logs').insert({
      action: 'VERIFY',
      status: fetched.status,
      program_type: row.program_type,
      source_id: null,
      canonical_url: row.canonical_url,
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

    if (fetched.status === 'NOT_MODIFIED') {
      const hours = (now.getTime() - new Date(row.last_verified_at).getTime()) / 36e5;
      const freshness = freshnessScoreFromHours(hours);
      await supabase
        .from('canada_opportunity')
        .update({ last_verified_at: now.toISOString(), freshness_score: freshness, status: 'ACTIVE', status_reason: null })
        .eq('id', row.id);
      summary.notModified += 1;
      continue;
    }

    if (fetched.status === 'BLOCKED') {
      await supabase
        .from('canada_opportunity')
        .update({ last_verified_at: now.toISOString(), status: 'BLOCKED', status_reason: fetched.blockedReason })
        .eq('id', row.id);
      summary.blocked += 1;
      continue;
    }

    if (fetched.status !== 'OK' || !fetched.bodyText) {
      summary.errors += 1;
      continue;
    }

    const built = buildOpportunityFromHtml({
      programType: row.program_type,
      canonicalUrl: row.canonical_url,
      sourceUrl: row.source_url,
      html: fetched.bodyText,
      etag: fetched.etag,
      lastModified: fetched.lastModified,
    });

    const blocked = looksBlocked(fetched.bodyText);
    const loginWall = looksLikeLoginWall(fetched.bodyText);

    const gate = safetyGate({
      blocked,
      loginWall,
      applicationUrl: built.appUrl,
      deadlineDate: built.deadline.date,
      deadlineConfidence: built.deadline.confidence,
    });

    const hours = (now.getTime() - new Date(row.last_verified_at).getTime()) / 36e5;
    const freshness = freshnessScoreFromHours(hours);

    const nextHash = built.contentHash;
    const changed = nextHash !== row.content_hash;

    if (!changed) {
      await supabase
        .from('canada_opportunity')
        .update({ last_verified_at: now.toISOString(), freshness_score: freshness, status: gate.status, status_reason: gate.reason })
        .eq('id', row.id);
      summary.notModified += 1;
      continue;
    }

    await supabase
      .from('canada_opportunity')
      .update({
        title_clean: built.titleClean,
        nutshell_15_words: built.nutshell,
        funding_type: built.funding.type,
        funding_confidence: built.funding.confidence,
        funding_evidence: built.funding.evidence,
        international_allowed: built.intl.allowed,
        eligibility_confidence: built.intl.confidence,
        eligibility_evidence: built.intl.evidence,
        start_term: built.startTerm,
        deadline_date: built.deadline.date,
        deadline_confidence: built.deadline.confidence,
        deadline_evidence: built.deadline.evidence,
        application_url: built.appUrl ?? row.application_url,
        content_hash: built.contentHash,
        page_last_modified: built.pageLastModified,
        etag: built.etag,
        last_verified_at: now.toISOString(),
        freshness_score: freshness,
        status: gate.status,
        status_reason: gate.reason,
      })
      .eq('id', row.id);

    summary.updated += 1;
  }

  return summary;
}
