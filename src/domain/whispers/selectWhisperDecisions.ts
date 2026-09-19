import type { FixtureSnapshot, LegalStatus } from '../types';
import { annotateItems, promotableItems, type AnnotatedItem } from '../selectors';
import {
  buildAuditLinkDisplay,
  buildCalendarConfirmationDisplay,
  buildCalendarEvidenceDisplay,
  buildConfirmedClusterDisplay,
  buildEvidenceDisplay,
  buildFreshnessDisplay,
  buildPriorityDisplay,
  buildVerificationDisplay,
} from '../display';
import type { CalendarEventView } from '../calendar';
import { isoFromMs } from './clock';
import { evaluateWhisperCandidate } from './decisionEngine';
import {
  WHISPER_RULE_VERSION,
  type CandidateSourceType,
  type WhisperCandidate,
  type WhisperClock,
  type WhisperDecision,
  type WhisperDecisionView,
  type WhisperHistoryStore,
} from './types';

export interface SelectWhisperDecisionsInput {
  snapshot: FixtureSnapshot;

  now: Date;

  clock: WhisperClock;
  historyStore: WhisperHistoryStore;

  calendar?: {
    views: CalendarEventView[];
    sourceLegalStatus: LegalStatus;
    sourceEnabled: boolean;
  };
}

const messageFor = (decision: WhisperDecision, sourceType: CandidateSourceType): string => {
  const code = decision.reason.split(': ')[1]?.split(' (')[0] ?? decision.decision;
  switch (decision.decision) {
    case 'glow':
    case 'whisper':
      return sourceType === 'cluster'
        ? 'Confirmed cluster updated'
        : sourceType === 'calendar_event'
          ? 'Scheduled event approaching'
          : 'Source-backed item to review';
    case 'hold':
      return `Held (${code})`;
    default:
      return `Suppressed (${code})`;
  }
};

const targetOf = (
  candidate: WhisperCandidate,
): { targetType: WhisperDecisionView['targetType']; targetId: string } => {
  switch (candidate.candidateSourceType) {
    case 'cluster':
      return { targetType: 'cluster', targetId: candidate.clusterId ?? candidate.candidateId };
    case 'calendar_event':
      return {
        targetType: 'calendar_event',
        targetId: candidate.calendarEventId ?? candidate.candidateId,
      };
    default:
      return { targetType: 'item', targetId: candidate.itemId ?? candidate.candidateId };
  }
};

const toView = (decision: WhisperDecision, candidate: WhisperCandidate): WhisperDecisionView => ({
  decisionId: decision.decisionId,
  candidateSourceType: candidate.candidateSourceType,
  level: decision.decision,
  message: messageFor(decision, candidate.candidateSourceType),
  reason: decision.reason,
  ruleVersion: decision.ruleVersion,
  ...targetOf(candidate),
  priorityReason: candidate.priorityDisplay.priorityReason,
  verificationTier: candidate.verificationDisplay.verificationTier,
  freshnessState: candidate.freshnessDisplay.freshnessState,
  evidenceLabel: candidate.evidenceDisplay.label,
  evidenceRef: candidate.evidenceDisplay.referenceValue,
  evidenceHref: candidate.evidenceDisplay.href,
  auditLabel: candidate.auditLinkDisplay.label,
  auditHref: candidate.auditLinkDisplay.href,
  clusterId: candidate.confirmedClusterDisplay?.clusterId,
  confirmedMemberCount: candidate.confirmedClusterDisplay?.confirmedMemberCount,
  clusterRuleVersion: candidate.confirmedClusterDisplay?.clusterRuleVersion,
  scheduledFor: candidate.calendarConfirmationDisplay?.scheduledFor,
  confirmationState: candidate.calendarConfirmationDisplay?.confirmationState,
});

const itemCandidateFrom = (a: AnnotatedItem, createdAt: string): WhisperCandidate => {
  const clusterDisplay = buildConfirmedClusterDisplay(a.confirmedCluster);
  const isCluster = clusterDisplay !== null;
  return {
    candidateId: isCluster
      ? `cand-cluster-${clusterDisplay.clusterId}`
      : `cand-item-${a.item.itemId}`,
    candidateSourceType: isCluster ? 'cluster' : 'item',
    itemId: isCluster ? undefined : a.item.itemId,
    clusterId: isCluster ? clusterDisplay.clusterId : undefined,
    sourceId: a.source.sourceId,
    promotable: true,

    sourceLegalStatus: a.source.legalStatus,
    sourceEnabled: a.source.enabled,
    evidenceDisplay: buildEvidenceDisplay(a.item),
    priorityDisplay: buildPriorityDisplay(a.priority, clusterDisplay),
    verificationDisplay: buildVerificationDisplay(a.item.verificationTier),
    freshnessDisplay: buildFreshnessDisplay(a.item),
    confirmedClusterDisplay: clusterDisplay,
    auditLinkDisplay: buildAuditLinkDisplay('news_item', a.item.itemId),
    createdAt,
    ruleVersion: WHISPER_RULE_VERSION,
  };
};

const calendarCandidateFrom = (
  view: CalendarEventView,
  proof: { sourceLegalStatus: LegalStatus; sourceEnabled: boolean },
  createdAt: string,
): WhisperCandidate => {
  const r = view.current;
  const cc = buildCalendarConfirmationDisplay(view);
  return {
    candidateId: `cand-cal-${r.calendarEventId}`,
    candidateSourceType: 'calendar_event',
    calendarEventId: r.calendarEventId,
    sourceId: r.sourceId,
    promotable: true,
    sourceLegalStatus: proof.sourceLegalStatus,
    sourceEnabled: proof.sourceEnabled,
    evidenceDisplay: buildCalendarEvidenceDisplay({
      sourceUrl: r.sourceUrl,
      sourceEventId: r.sourceEventId,
    }),
    priorityDisplay: buildPriorityDisplay(
      {
        priorityTier: 'P2',
        urgencyLabel: 'today',
        priorityReason: `scheduled ${r.importanceTier}-importance event`,
      },
      null,
    ),
    verificationDisplay: buildVerificationDisplay('scheduled'),
    freshnessDisplay: buildFreshnessDisplay({
      freshnessState: 'live',
      observedAt: r.observedAt,
      ingestedAt: r.ingestedAt,
      normalizedAt: r.normalizedAt,
      sourceEventTime: r.scheduledFor ?? r.observedAt,
    }),
    calendarConfirmationDisplay: cc,
    calendarImportance: r.importanceTier,
    calendarRevisionStatus: r.revisionStatus,
    auditLinkDisplay: buildAuditLinkDisplay('calendar_event', r.sourceEventId),
    createdAt,
    ruleVersion: WHISPER_RULE_VERSION,
  };
};

export const selectWhisperDecisions = (
  input: SelectWhisperDecisionsInput,
): WhisperDecisionView[] => {
  const { snapshot, now, clock, historyStore } = input;
  const createdAt = isoFromMs(clock.now());

  const promotableIds = new Set(promotableItems(snapshot).map((i) => i.itemId));
  const annotated = annotateItems(snapshot, now).filter((a) => promotableIds.has(a.item.itemId));

  const candidates: WhisperCandidate[] = [];
  const seenClusters = new Set<string>();
  for (const a of annotated) {
    const candidate = itemCandidateFrom(a, createdAt);
    if (candidate.candidateSourceType === 'cluster') {
      if (seenClusters.has(candidate.clusterId!)) continue;
      seenClusters.add(candidate.clusterId!);
    }
    candidates.push(candidate);
  }

  if (input.calendar) {
    const proof = {
      sourceLegalStatus: input.calendar.sourceLegalStatus,
      sourceEnabled: input.calendar.sourceEnabled,
    };
    for (const view of input.calendar.views) {
      candidates.push(calendarCandidateFrom(view, proof, createdAt));
    }
  }

  return candidates.map((candidate) => {
    const decision = evaluateWhisperCandidate({ candidate, historyStore, clock });
    return toView(decision, candidate);
  });
};
