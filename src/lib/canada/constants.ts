export const CANADA_PROGRAM_TYPES = ['VISITING_RESEARCH', 'INTERNSHIP', 'PHD'] as const;
export type CanadaProgramType = (typeof CANADA_PROGRAM_TYPES)[number];

export const CANADA_FUNDING_TYPES = [
  'FUNDED',
  'PARTIALLY_FUNDED',
  'EXTERNAL_FUNDING_OK',
  'SELF_FUNDED_OK',
  'UNKNOWN',
] as const;
export type CanadaFundingType = (typeof CANADA_FUNDING_TYPES)[number];

export const CANADA_TRI_STATES = ['YES', 'NO', 'UNKNOWN'] as const;
export type CanadaTriState = (typeof CANADA_TRI_STATES)[number];

export const CANADA_CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type CanadaConfidence = (typeof CANADA_CONFIDENCE)[number];

export const CANADA_OPPORTUNITY_STATUS = ['ACTIVE', 'EXPIRED', 'BLOCKED', 'NEEDS_REVIEW'] as const;
export type CanadaOpportunityStatus = (typeof CANADA_OPPORTUNITY_STATUS)[number];

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${String(x)}`);
}

export const CANADA_TAB_LABEL: Record<CanadaProgramType, string> = {
  VISITING_RESEARCH: 'Visiting Research',
  INTERNSHIP: 'Internships',
  PHD: 'PhD',
};

export const CANADA_FUNDING_LABEL: Record<CanadaFundingType, string> = {
  FUNDED: 'Funded',
  PARTIALLY_FUNDED: 'Partially funded',
  EXTERNAL_FUNDING_OK: 'External funding OK',
  SELF_FUNDED_OK: 'Self-funded OK',
  UNKNOWN: 'Unknown',
};

export const CANADA_TRI_STATE_LABEL: Record<CanadaTriState, string> = {
  YES: 'Yes',
  NO: 'No',
  UNKNOWN: 'Unknown',
};
