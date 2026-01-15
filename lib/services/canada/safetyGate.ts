import type { CanadaConfidence, CanadaOpportunityStatus } from '../../../src/lib/canada/constants';

export type SafetyGateDecision = {
  status: CanadaOpportunityStatus;
  reason: string | null;
};

export function isExpired(deadlineDate: string | null, confidence: CanadaConfidence) {
  if (!deadlineDate) return false;
  if (confidence === 'LOW') return false;
  const today = new Date().toISOString().slice(0, 10);
  return deadlineDate < today;
}

export function safetyGate(args: {
  blocked: boolean;
  loginWall: boolean;
  applicationUrl: string | null;
  deadlineDate: string | null;
  deadlineConfidence: CanadaConfidence;
}): SafetyGateDecision {
  if (args.blocked) return { status: 'BLOCKED', reason: 'blocked' };
  if (args.loginWall) return { status: 'BLOCKED', reason: 'login_wall' };
  if (!args.applicationUrl) return { status: 'NEEDS_REVIEW', reason: 'missing_application_url' };

  if (isExpired(args.deadlineDate, args.deadlineConfidence)) {
    return { status: 'EXPIRED', reason: 'expired_deadline' };
  }

  return { status: 'ACTIVE', reason: null };
}
