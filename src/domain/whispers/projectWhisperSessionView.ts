import {
  WHISPER_RULE_VERSION,
  type WhisperClock,
  type WhisperDecisionView,
  type WhisperHistorySnapshot,
} from './types';
import { isoFromMs } from './clock';
import type { WhisperInteractionTargetType } from './interactionTypes';

export type WhisperSessionProjectionReason =
  | 'active'
  | 'dismissed_quiet_window'
  | 'expired_quiet_window'
  | 'seen_no_suppression'
  | 'open_audit_no_suppression'
  | 'suppressed_inspection_only';

export interface WhisperSessionProjection {
  decisionId: string;
  targetType: WhisperInteractionTargetType;
  targetId: string;
  projectionReason: WhisperSessionProjectionReason;
  quietUntil?: string;
  sourceInteractionRecordId?: string;
  ruleVersion: string;
}

export interface WhisperInteractionSummary {
  activeDismissals: number;
  markSeen: number;
  opened: number;
}

export interface WhisperSessionView {
  sessionRevision: number;
  generatedAt: string;
  activeDecisions: readonly WhisperDecisionView[];
  heldByInteraction: readonly WhisperDecisionView[];
  inspectionOnlyDecisions: readonly WhisperDecisionView[];
  projections: readonly WhisperSessionProjection[];
  interactionSummary: WhisperInteractionSummary;
  ruleVersion: string;
}

export interface ProjectWhisperSessionViewInput {
  decisions: readonly WhisperDecisionView[];
  historySnapshot: WhisperHistorySnapshot;
  clock: WhisperClock;
}

const dismissalMatchesView = (
  d: { targetType: string; targetId: string },
  view: WhisperDecisionView,
): boolean =>
  d.targetType === 'global' || (d.targetType === view.targetType && d.targetId === view.targetId);

const interactionMatchesView = (
  r: { targetType: string; targetId: string; decisionId?: string },
  view: WhisperDecisionView,
): boolean =>
  r.decisionId === view.decisionId ||
  (r.targetType === view.targetType && r.targetId === view.targetId);

export const projectWhisperSessionView = (
  input: ProjectWhisperSessionViewInput,
): WhisperSessionView => {
  const { decisions, historySnapshot, clock } = input;
  const nowMs = clock.now();
  const generatedAt = isoFromMs(nowMs);

  const active: WhisperDecisionView[] = [];
  const held: WhisperDecisionView[] = [];
  const inspection: WhisperDecisionView[] = [];
  const projections: WhisperSessionProjection[] = [];

  for (const view of decisions) {
    const base = {
      decisionId: view.decisionId,
      targetType: view.targetType,
      targetId: view.targetId,
      ruleVersion: WHISPER_RULE_VERSION,
    };

    if (view.level === 'suppress') {
      inspection.push(view);
      projections.push({ ...base, projectionReason: 'suppressed_inspection_only' });
      continue;
    }

    const activeDismissal = historySnapshot.dismissalRecords.find((d) => {
      const until = Date.parse(d.quietUntil);
      return !Number.isNaN(until) && until > nowMs && dismissalMatchesView(d, view);
    });
    if (activeDismissal) {
      held.push(view);
      projections.push({
        ...base,
        projectionReason: 'dismissed_quiet_window',
        quietUntil: activeDismissal.quietUntil,
        sourceInteractionRecordId: activeDismissal.dismissalId,
      });
      continue;
    }

    const hadExpiredDismissal = historySnapshot.dismissalRecords.some((d) => {
      const until = Date.parse(d.quietUntil);
      return !Number.isNaN(until) && until <= nowMs && dismissalMatchesView(d, view);
    });
    const seen = historySnapshot.interactionRecords.find(
      (r) => r.interactionType === 'mark_seen' && interactionMatchesView(r, view),
    );
    const opened = historySnapshot.interactionRecords.find(
      (r) =>
        (r.interactionType === 'open_audit' || r.interactionType === 'open_evidence') &&
        interactionMatchesView(r, view),
    );

    let reason: WhisperSessionProjectionReason = 'active';
    let sourceInteractionRecordId: string | undefined;
    if (hadExpiredDismissal) {
      reason = 'expired_quiet_window';
    } else if (seen) {
      reason = 'seen_no_suppression';
      sourceInteractionRecordId = seen.recordId;
    } else if (opened) {
      reason = 'open_audit_no_suppression';
      sourceInteractionRecordId = opened.recordId;
    }

    active.push(view);
    projections.push({ ...base, projectionReason: reason, sourceInteractionRecordId });
  }

  const interactionSummary: WhisperInteractionSummary = {
    activeDismissals: held.length,
    markSeen: historySnapshot.interactionRecords.filter((r) => r.interactionType === 'mark_seen')
      .length,
    opened: historySnapshot.interactionRecords.filter(
      (r) => r.interactionType === 'open_audit' || r.interactionType === 'open_evidence',
    ).length,
  };

  const sessionRevision =
    historySnapshot.decisionRecords.length +
    historySnapshot.dismissalRecords.length +
    historySnapshot.interactionRecords.length;

  const sessionView: WhisperSessionView = {
    sessionRevision,
    generatedAt,
    activeDecisions: Object.freeze([...active]),
    heldByInteraction: Object.freeze([...held]),
    inspectionOnlyDecisions: Object.freeze([...inspection]),
    projections: Object.freeze(projections.map((p) => Object.freeze(p))),
    interactionSummary: Object.freeze(interactionSummary),
    ruleVersion: WHISPER_RULE_VERSION,
  };
  return Object.freeze(sessionView);
};
