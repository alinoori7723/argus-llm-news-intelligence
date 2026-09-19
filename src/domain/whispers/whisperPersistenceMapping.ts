import type { AppendRecordInput } from '../persistence';
import type { WhisperDecisionRecord, WhisperDismissalRecord } from './types';
import type { WhisperInteractionRecord } from './interactionTypes';
import {
  WHISPER_DECISIONS_STREAM,
  WHISPER_DECISION_SCHEMA_VERSION,
  WHISPER_DISMISSALS_STREAM,
  WHISPER_DISMISSAL_SCHEMA_VERSION,
  WHISPER_INTERACTIONS_STREAM,
  WHISPER_INTERACTION_SCHEMA_VERSION,
  WHISPER_PERSISTENCE_PRODUCER_VERSION,
  WHISPER_PERSISTENCE_SOURCE_PHASE,
} from './whisperPersistenceStreams';

export const decisionRecordId = (streamSequence: number, record: WhisperDecisionRecord): string =>
  `whisper-decision:${streamSequence}:${record.candidateId}:${record.ruleVersion}`;

export const dismissalRecordId = (streamSequence: number, record: WhisperDismissalRecord): string =>
  `whisper-dismissal:${streamSequence}:${record.targetType}:${record.targetId}:${record.ruleVersion}`;

export const interactionRecordId = (
  streamSequence: number,
  record: WhisperInteractionRecord,
): string =>
  `whisper-interaction:${streamSequence}:${record.interactionType}:${record.targetType}:${record.targetId}:${record.ruleVersion}`;

export const mapDecisionToInput = (
  record: WhisperDecisionRecord,
  streamSequence: number,
): AppendRecordInput<WhisperDecisionRecord> => ({
  recordId: decisionRecordId(streamSequence, record),
  streamName: WHISPER_DECISIONS_STREAM,

  recordedAt: record.createdAt,
  schemaVersion: WHISPER_DECISION_SCHEMA_VERSION,
  producerVersion: WHISPER_PERSISTENCE_PRODUCER_VERSION,
  sourcePhase: WHISPER_PERSISTENCE_SOURCE_PHASE,
  reason: record.reason,
  payload: record,
});

export const mapDismissalToInput = (
  record: WhisperDismissalRecord,
  streamSequence: number,
): AppendRecordInput<WhisperDismissalRecord> => ({
  recordId: dismissalRecordId(streamSequence, record),
  streamName: WHISPER_DISMISSALS_STREAM,
  recordedAt: record.dismissedAt,
  schemaVersion: WHISPER_DISMISSAL_SCHEMA_VERSION,
  producerVersion: WHISPER_PERSISTENCE_PRODUCER_VERSION,
  sourcePhase: WHISPER_PERSISTENCE_SOURCE_PHASE,
  ...(record.reason !== undefined ? { reason: record.reason } : {}),
  payload: record,
});

export const mapInteractionToInput = (
  record: WhisperInteractionRecord,
  streamSequence: number,
): AppendRecordInput<WhisperInteractionRecord> => ({
  recordId: interactionRecordId(streamSequence, record),
  streamName: WHISPER_INTERACTIONS_STREAM,
  recordedAt: record.recordedAt,
  schemaVersion: WHISPER_INTERACTION_SCHEMA_VERSION,
  producerVersion: WHISPER_PERSISTENCE_PRODUCER_VERSION,
  sourcePhase: WHISPER_PERSISTENCE_SOURCE_PHASE,
  ...(record.reason !== undefined ? { reason: record.reason } : {}),
  payload: record,
});
