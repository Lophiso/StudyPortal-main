import type {
  CanadaConfidence,
  CanadaFundingType,
  CanadaOpportunityStatus,
  CanadaProgramType,
  CanadaTriState,
} from '../../../src/lib/canada/constants';

export type CanadaSourceStrategy = 'GOOGLE_SEED' | 'CURATED' | 'OPPORTUNISTIC';
export type CanadaFetchAction = 'DISCOVER' | 'VERIFY';
export type CanadaFetchStatus = 'OK' | 'NOT_MODIFIED' | 'BLOCKED' | 'ERROR';

export type CanadaSourceRow = {
  id: string;
  program_type: CanadaProgramType;
  strategy: CanadaSourceStrategy;
  seed_key: string | null;
  base_url: string;
  allow_paths: string[];
  block_paths: string[];
  max_depth: number;
  active: boolean;
  respect_robots: boolean;
  max_requests_per_run: number;
  min_delay_ms: number;
};

export type CanadaOpportunityInsert = {
  program_type: CanadaProgramType;
  country?: string;
  province?: string | null;
  city?: string | null;
  institution_name: string;
  department?: string | null;
  lab_group?: string | null;
  title_clean: string;
  nutshell_15_words: string;
  funding_type: CanadaFundingType;
  funding_confidence: CanadaConfidence;
  funding_evidence: string | null;
  international_allowed: CanadaTriState;
  eligibility_confidence: CanadaConfidence;
  eligibility_notes: string | null;
  eligibility_evidence: string | null;
  start_term: string | null;
  deadline_date: string | null;
  deadline_confidence: CanadaConfidence;
  deadline_evidence: string | null;
  application_url: string;
  source_url: string;
  canonical_url: string;
  last_verified_at?: string;
  freshness_score?: number;
  status: CanadaOpportunityStatus;
  status_reason: string | null;
  content_hash: string;
  page_last_modified: string | null;
  etag: string | null;
};

export type CanadaFetchResult = {
  status: CanadaFetchStatus;
  fetchedUrl: string;
  canonicalUrl: string;
  httpStatus: number | null;
  elapsedMs: number;
  responseBytes: number | null;
  etag: string | null;
  lastModified: string | null;
  bodyText: string | null;
  blockedReason: string | null;
  errorMessage: string | null;
};
