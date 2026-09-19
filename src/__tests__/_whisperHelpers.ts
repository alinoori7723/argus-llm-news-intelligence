import { WHISPER_RULE_VERSION, isoFromMs, type WhisperCandidate } from '@/domain/whispers';
import {
  buildAuditLinkDisplay,
  buildEvidenceDisplay,
  buildFreshnessDisplay,
  buildPriorityDisplay,
  buildVerificationDisplay,
  type CalendarConfirmationDisplay,
  type ConfirmedClusterDisplay,
} from '@/domain/display';
import type { FreshnessState, PriorityTier, VerificationTier } from '@/domain/types';

export const BASE_MS = Date.parse('2026-06-01T12:00:00.000Z');

export const clusterDisplay = (
  count: number,
  over: Partial<ConfirmedClusterDisplay> = {},
): ConfirmedClusterDisplay => ({
  clusterId: 'ccl.1',
  confirmedMemberCount: count,
  sourceCount: count,
  clusterRuleVersion: 'cluster-rule-v1',
  membershipReasonSummary: 'confirmed by exact deterministic match',
  correctionCount: 0,
  detailHref: '/clusters',
  label: 'Confirmed deterministic cluster',
  ...over,
});

export const calendarDisplay = (
  over: Partial<CalendarConfirmationDisplay> = {},
): CalendarConfirmationDisplay => ({
  scheduledFor: isoFromMs(BASE_MS + 42 * 60_000),
  lastConfirmedAt: isoFromMs(BASE_MS),
  confirmationState: 'fresh',
  confirmationCaveat: undefined,
  canPromoteHighAttention: true,
  ...over,
});

interface Overrides {
  verificationTier?: VerificationTier;
  priorityTier?: PriorityTier;
  priorityReason?: string;
  freshnessState?: FreshnessState;
}

export const itemCandidate = (
  over: Partial<WhisperCandidate> & Overrides = {},
): WhisperCandidate => {
  const tier = over.verificationTier ?? 'reported';
  const pTier = over.priorityTier ?? 'P1';
  const iso = isoFromMs(BASE_MS);
  const sourceType = over.candidateSourceType ?? 'item';
  return {
    candidateId: over.candidateId ?? 'cand-item',
    candidateSourceType: sourceType,
    itemId: 'itemId' in over ? over.itemId : sourceType === 'item' ? 'it.1' : undefined,
    clusterId: over.clusterId,
    calendarEventId: over.calendarEventId,
    sourceId: over.sourceId ?? 'src.a',
    promotable: over.promotable ?? true,
    sourceLegalStatus: over.sourceLegalStatus ?? 'allowed',
    sourceEnabled: over.sourceEnabled ?? true,
    containsForbiddenWording: over.containsForbiddenWording,
    evidenceDisplay:
      over.evidenceDisplay ??
      buildEvidenceDisplay({ url: 'https://h/x', sourceItemId: 'evt-1', itemId: 'it.1' }),
    priorityDisplay:
      over.priorityDisplay ??
      buildPriorityDisplay(
        {
          priorityTier: pTier,
          urgencyLabel: 'soon',
          priorityReason: over.priorityReason ?? 'source tier reputable (+2)',
        },
        null,
      ),
    verificationDisplay: over.verificationDisplay ?? buildVerificationDisplay(tier),
    freshnessDisplay:
      over.freshnessDisplay ??
      buildFreshnessDisplay({
        freshnessState: over.freshnessState ?? 'live',
        observedAt: iso,
        ingestedAt: iso,
        normalizedAt: iso,
        sourceEventTime: iso,
      }),
    confirmedClusterDisplay: over.confirmedClusterDisplay,
    calendarConfirmationDisplay: over.calendarConfirmationDisplay,
    calendarImportance: over.calendarImportance,
    calendarRevisionStatus: over.calendarRevisionStatus,
    auditLinkDisplay: over.auditLinkDisplay ?? buildAuditLinkDisplay('news_item', 'it.1'),
    createdAt: over.createdAt ?? iso,
    ruleVersion: over.ruleVersion ?? WHISPER_RULE_VERSION,
  };
};

export const clusterCandidate = (
  count: number,
  over: Partial<WhisperCandidate> & Overrides = {},
): WhisperCandidate =>
  itemCandidate({
    candidateId: over.candidateId ?? 'cand-cluster',
    candidateSourceType: 'cluster',
    clusterId: over.clusterId ?? 'ccl.1',
    confirmedClusterDisplay:
      'confirmedClusterDisplay' in over
        ? over.confirmedClusterDisplay
        : clusterDisplay(count, { clusterId: over.clusterId ?? 'ccl.1' }),
    ...over,
  });

export const calendarCandidate = (
  over: Partial<WhisperCandidate> & Overrides = {},
): WhisperCandidate =>
  itemCandidate({
    candidateId: over.candidateId ?? 'cand-cal',
    candidateSourceType: 'calendar_event',
    calendarEventId: over.calendarEventId ?? 'evt.cpi',
    calendarImportance: over.calendarImportance ?? 'high',
    calendarRevisionStatus: over.calendarRevisionStatus ?? 'active',
    calendarConfirmationDisplay: over.calendarConfirmationDisplay ?? calendarDisplay(),
    ...over,
  });
