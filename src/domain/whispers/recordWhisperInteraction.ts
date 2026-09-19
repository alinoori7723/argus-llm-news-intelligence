import {
  DISMISSAL_QUIET_WINDOW_MINUTES,
  MINUTE_MS,
  WHISPER_RULE_VERSION,
  type DismissalTargetType,
  type WhisperClock,
  type WhisperDismissalRecord,
  type WhisperHistoryStore,
} from './types';
import { isoFromMs } from './clock';
import type {
  AppendedRecordRef,
  WhisperInteractionIntent,
  WhisperInteractionRecord,
  WhisperInteractionResult,
  WhisperInteractionTargetType,
  WhisperInteractionType,
} from './interactionTypes';

export interface RecordWhisperInteractionInput {
  intent: WhisperInteractionIntent;
  clock: WhisperClock;
  historyStore: WhisperHistoryStore;
}

const VALID_TYPES: readonly WhisperInteractionType[] = [
  'dismiss',
  'mark_seen',
  'open_audit',
  'open_evidence',
];
const VALID_TARGETS: readonly WhisperInteractionTargetType[] = [
  'decision',
  'item',
  'cluster',
  'calendar_event',
];

const DISMISSABLE_TARGETS: readonly WhisperInteractionTargetType[] = [
  'item',
  'cluster',
  'calendar_event',
];

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export const recordWhisperInteraction = (
  input: RecordWhisperInteractionInput,
): WhisperInteractionResult => {
  const { intent, clock, historyStore } = input;
  const recordedAt = isoFromMs(clock.now());
  const intentId = isNonEmptyString(intent?.intentId) ? intent.intentId : 'unknown';

  const reject = (reason: string): WhisperInteractionResult => ({
    resultId: `wint-result-${intentId}`,
    intentId,
    interactionType: (intent?.interactionType ?? 'dismiss') as WhisperInteractionType,
    status: 'rejected',
    reason,
    recordedAt,
    ruleVersion: WHISPER_RULE_VERSION,
    appendedRecords: [],
    deterministicInputs: [`recordedAt=${recordedAt}`, `reject=${reason}`],
  });

  if (!intent || !isNonEmptyString(intent.intentId)) return reject('malformed_intent');
  if (!VALID_TYPES.includes(intent.interactionType)) return reject('malformed_intent');
  if (!VALID_TARGETS.includes(intent.targetType)) return reject('malformed_intent');
  if (!isNonEmptyString(intent.targetId)) return reject('missing_target');

  const baseInputs = [
    `recordedAt=${recordedAt}`,
    `interactionType=${intent.interactionType}`,
    `targetType=${intent.targetType}`,
    `targetId=${intent.targetId}`,
  ];

  if (intent.interactionType === 'dismiss') {
    if (!DISMISSABLE_TARGETS.includes(intent.targetType)) {
      return reject('undismissable_target');
    }
    const nowMs = clock.now();
    const snapshot = historyStore.getSnapshot();

    const activeMatch = snapshot.dismissalRecords.find((d) => {
      const until = Date.parse(d.quietUntil);
      return (
        d.targetType === (intent.targetType as DismissalTargetType) &&
        d.targetId === intent.targetId &&
        !Number.isNaN(until) &&
        until > nowMs
      );
    });
    if (activeMatch) {
      const noop: WhisperInteractionRecord = {
        recordId: `wint-${intent.intentId}`,
        intentId: intent.intentId,
        interactionType: 'dismiss',
        targetType: intent.targetType,
        targetId: intent.targetId,
        decisionId: intent.decisionId,
        itemId: intent.itemId,
        clusterId: intent.clusterId,
        calendarEventId: intent.calendarEventId,
        sourceId: intent.sourceId,
        recordedAt,
        ruleVersion: WHISPER_RULE_VERSION,
        reason: 'already_dismissed_in_quiet_window',
      };
      historyStore.appendInteraction(noop);
      return {
        resultId: `wint-result-${intent.intentId}`,
        intentId: intent.intentId,
        interactionType: 'dismiss',
        status: 'ignored',
        reason: 'already_dismissed_in_quiet_window',
        recordedAt,
        ruleVersion: WHISPER_RULE_VERSION,
        appendedRecords: [{ kind: 'interaction', recordId: noop.recordId }],
        deterministicInputs: [...baseInputs, `activeQuietUntil=${activeMatch.quietUntil}`],
      };
    }

    const quietUntil = isoFromMs(nowMs + DISMISSAL_QUIET_WINDOW_MINUTES * MINUTE_MS);
    const dismissal: WhisperDismissalRecord = {
      dismissalId: `wdis-${intent.intentId}`,
      targetType: intent.targetType as DismissalTargetType,
      targetId: intent.targetId,
      dismissedAt: recordedAt,
      quietUntil,
      reason: intent.reason,
      ruleVersion: WHISPER_RULE_VERSION,
    };
    historyStore.appendDismissal(dismissal);
    return {
      resultId: `wint-result-${intent.intentId}`,
      intentId: intent.intentId,
      interactionType: 'dismiss',
      status: 'recorded',
      reason: 'dismissal_recorded',
      recordedAt,
      ruleVersion: WHISPER_RULE_VERSION,
      appendedRecords: [{ kind: 'dismissal', recordId: dismissal.dismissalId }],
      deterministicInputs: [
        ...baseInputs,
        `quietWindowMinutes=${DISMISSAL_QUIET_WINDOW_MINUTES}`,
        `quietUntil=${quietUntil}`,
      ],
    };
  }

  const record: WhisperInteractionRecord = {
    recordId: `wint-${intent.intentId}`,
    intentId: intent.intentId,
    interactionType: intent.interactionType,
    targetType: intent.targetType,
    targetId: intent.targetId,
    decisionId: intent.decisionId,
    itemId: intent.itemId,
    clusterId: intent.clusterId,
    calendarEventId: intent.calendarEventId,
    sourceId: intent.sourceId,
    recordedAt,
    ruleVersion: WHISPER_RULE_VERSION,
    reason: intent.reason ?? `${intent.interactionType}_recorded`,
  };
  historyStore.appendInteraction(record);
  const appended: AppendedRecordRef[] = [{ kind: 'interaction', recordId: record.recordId }];
  return {
    resultId: `wint-result-${intent.intentId}`,
    intentId: intent.intentId,
    interactionType: intent.interactionType,
    status: 'recorded',
    reason: `${intent.interactionType}_recorded`,
    recordedAt,
    ruleVersion: WHISPER_RULE_VERSION,
    appendedRecords: appended,
    deterministicInputs: baseInputs,
  };
};
