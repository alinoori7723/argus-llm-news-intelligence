import {
  GLOW_CONFIRMED_CLUSTER_MEMBER_THRESHOLD,
  WHISPER_RULE_VERSION,
  type WhisperCandidate,
  type WhisperEligibilityResult,
} from './types';

export const evaluateEligibility = (candidate: WhisperCandidate): WhisperEligibilityResult => {
  const hardExclusions: string[] = [];
  const reasons: string[] = [];

  if (candidate.promotable !== true) hardExclusions.push('not_promotable');

  const legal = candidate.sourceLegalStatus;
  if (legal === undefined || legal === null) {
    hardExclusions.push('missing_source_legal_status');
    hardExclusions.push('missing_source_proof');
  } else if (legal === 'needs_review') {
    hardExclusions.push('source_needs_review');
  } else if (legal === 'disabled') {
    hardExclusions.push('source_disabled');
  } else if (legal !== 'allowed') {
    hardExclusions.push('source_not_allowed');
  }

  if (candidate.sourceEnabled === undefined || candidate.sourceEnabled === null) {
    hardExclusions.push('missing_source_enabled');
    if (!hardExclusions.includes('missing_source_proof')) {
      hardExclusions.push('missing_source_proof');
    }
  } else if (candidate.sourceEnabled !== true) {
    hardExclusions.push('source_disabled');
  }

  if (candidate.containsForbiddenWording === true) {
    hardExclusions.push('forbidden_action_wording');
  }

  const tier = candidate.verificationDisplay.verificationTier;
  if (tier === 'rumor') hardExclusions.push('rumor_high_attention');
  else if (tier === 'unverified') hardExclusions.push('unverified_high_attention');
  else if (!candidate.verificationDisplay.mayPromoteHighAttention) {
    hardExclusions.push('verification_not_promotable');
  }

  const ev = candidate.evidenceDisplay;
  if (!ev || ev.referenceType === 'none' || !ev.referenceValue) {
    hardExclusions.push('missing_evidence');
  }
  if (!candidate.priorityDisplay || !candidate.priorityDisplay.priorityReason.trim()) {
    hardExclusions.push('missing_priority_reason');
  }
  if (!candidate.freshnessDisplay) hardExclusions.push('missing_freshness');
  if (!candidate.auditLinkDisplay || !candidate.auditLinkDisplay.href) {
    hardExclusions.push('missing_audit_link');
  }

  if (candidate.candidateSourceType === 'cluster') {
    const cd = candidate.confirmedClusterDisplay;
    if (
      !cd ||
      !cd.clusterRuleVersion ||
      cd.confirmedMemberCount < GLOW_CONFIRMED_CLUSTER_MEMBER_THRESHOLD
    ) {
      hardExclusions.push('unconfirmed_cluster');
    } else {
      reasons.push(`confirmed_cluster_members=${cd.confirmedMemberCount}`);
    }
  }

  if (candidate.candidateSourceType === 'calendar_event') {
    const cc = candidate.calendarConfirmationDisplay;
    if (!cc) hardExclusions.push('missing_calendar_confirmation');
    else if (cc.scheduledFor === null) hardExclusions.push('missing_scheduled_for');
    const status = candidate.calendarRevisionStatus;
    if (status === 'cancelled') hardExclusions.push('cancelled_not_upcoming');
    else if (status === 'postponed') hardExclusions.push('postponed_not_upcoming');
    else if (status === 'completed') hardExclusions.push('completed_not_upcoming');
    if (cc && cc.confirmationState === 'stale') {
      reasons.push('calendar_confirmation_stale');
    }
  }

  const deterministicInputs = [
    `sourceType=${candidate.candidateSourceType}`,
    `promotable=${candidate.promotable}`,
    `sourceLegalStatus=${candidate.sourceLegalStatus ?? 'absent'}`,
    `sourceEnabled=${candidate.sourceEnabled ?? 'absent'}`,
    `verificationTier=${tier}`,
    `evidence=${ev?.referenceType ?? 'none'}`,
    `auditLink=${candidate.auditLinkDisplay?.href ? 'present' : 'absent'}`,
  ];

  return {
    status: hardExclusions.length > 0 ? 'ineligible' : 'eligible',
    reasons,
    hardExclusions,
    deterministicInputs,
    ruleVersion: WHISPER_RULE_VERSION,
  };
};
