import type {
  CanadaConfidence,
  CanadaFundingType,
  CanadaOpportunityStatus,
  CanadaProgramType,
  CanadaTriState,
} from './constants';

export type CanadaOpportunityPublic = {
  id: string;
  program_type: CanadaProgramType;
  province: string | null;
  city: string | null;
  institution_name: string;
  department: string | null;
  lab_group: string | null;
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
  canonical_url: string;
  last_verified_at: string;
  freshness_score: number;
  status: CanadaOpportunityStatus;
};

export type CanadaListFilters = {
  program_type: CanadaProgramType;
  funding_type?: CanadaFundingType;
  province?: string;
  international_allowed?: CanadaTriState;
  institution?: string;
  start_term?: string;
  deadline_within_days?: number;
};

export type CanadaListResponse = {
  data: CanadaOpportunityPublic[];
  nextCursor: string | null;
};

export type CanadaDetailResponse = {
  data: CanadaOpportunityPublic;
};
