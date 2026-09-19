import type { AppendRecordInput } from '../persistence';
import type { ClusterMembershipEvent, DedupeDecision } from './types';
import {
  CLUSTER_DEDUPE_DECISIONS_STREAM,
  CLUSTER_DEDUPE_DECISION_SCHEMA_VERSION,
  CLUSTER_MEMBERSHIP_EVENTS_STREAM,
  CLUSTER_MEMBERSHIP_EVENT_SCHEMA_VERSION,
  CLUSTER_PERSISTENCE_PRODUCER_VERSION,
  CLUSTER_PERSISTENCE_SOURCE_PHASE,
} from './clusterPersistenceStreams';

export const membershipEventRecordId = (
  streamSequence: number,
  record: ClusterMembershipEvent,
): string =>
  record.eventType === 'added'
    ? `cluster-membership:${streamSequence}:${record.clusterId}:${record.itemId}:${record.reasonType}:${record.ruleVersion}`
    : `cluster-correction:${streamSequence}:${record.clusterId}:${record.itemId}:${record.membershipEventId}:${record.ruleVersion}`;

export const dedupeDecisionRecordId = (streamSequence: number, record: DedupeDecision): string =>
  `cluster-dedupe:${streamSequence}:${record.dedupeDecisionId}`;

export const mapMembershipEventToInput = (
  record: ClusterMembershipEvent,
  streamSequence: number,
): AppendRecordInput<ClusterMembershipEvent> => ({
  recordId: membershipEventRecordId(streamSequence, record),
  streamName: CLUSTER_MEMBERSHIP_EVENTS_STREAM,
  streamKey: record.clusterId,

  recordedAt: record.createdAt,
  schemaVersion: CLUSTER_MEMBERSHIP_EVENT_SCHEMA_VERSION,
  producerVersion: CLUSTER_PERSISTENCE_PRODUCER_VERSION,
  sourcePhase: CLUSTER_PERSISTENCE_SOURCE_PHASE,
  reason: record.eventType === 'added' ? record.reasonType : 'removed_as_error',
  payload: record,
});

export const mapDedupeDecisionToInput = (
  record: DedupeDecision,
  streamSequence: number,
): AppendRecordInput<DedupeDecision> => ({
  recordId: dedupeDecisionRecordId(streamSequence, record),
  streamName: CLUSTER_DEDUPE_DECISIONS_STREAM,

  recordedAt: record.createdAt,
  schemaVersion: CLUSTER_DEDUPE_DECISION_SCHEMA_VERSION,
  producerVersion: CLUSTER_PERSISTENCE_PRODUCER_VERSION,
  sourcePhase: CLUSTER_PERSISTENCE_SOURCE_PHASE,
  ...(record.reasonType !== undefined ? { reason: record.reasonType } : {}),
  payload: record,
});
