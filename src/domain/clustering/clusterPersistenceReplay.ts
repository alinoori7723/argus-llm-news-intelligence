import { deepClone, deepFreeze, type PersistedRecord } from '../persistence';
import type { ClusterMembershipEvent, DedupeDecision } from './types';
import {
  CLUSTER_DEDUPE_DECISIONS_STREAM,
  CLUSTER_MEMBERSHIP_EVENTS_STREAM,
  clusterStreamOrderIndex,
  isClusterStreamName,
} from './clusterPersistenceStreams';

export interface ClusterPersistenceSnapshot {
  readonly membershipEvents: readonly ClusterMembershipEvent[];
  readonly dedupeDecisions: readonly DedupeDecision[];
}

export const compareClusterRecordsGlobally = (a: PersistedRecord, b: PersistedRecord): number => {
  if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? -1 : 1;
  const sa = clusterStreamOrderIndex(a.streamName);
  const sb = clusterStreamOrderIndex(b.streamName);
  if (sa !== sb) return sa - sb;
  if (a.sequence !== b.sequence) return a.sequence - b.sequence;
  if (a.recordId !== b.recordId) return a.recordId < b.recordId ? -1 : 1;
  return 0;
};

export const orderClusterRecordsGlobally = (
  records: readonly PersistedRecord[],
): PersistedRecord[] => [...records].sort(compareClusterRecordsGlobally);

export const buildClusterSnapshot = (
  records: readonly PersistedRecord[],
): ClusterPersistenceSnapshot => {
  const seenIds = new Set<string>();
  const byStream = new Map<string, PersistedRecord[]>();

  for (const record of records) {
    if (!isClusterStreamName(record.streamName)) continue;
    if (seenIds.has(record.recordId)) {
      throw new Error(`clustering replay: duplicate recordId "${record.recordId}" in history`);
    }
    seenIds.add(record.recordId);
    const list = byStream.get(record.streamName) ?? [];
    list.push(record);
    byStream.set(record.streamName, list);
  }

  for (const [streamName, list] of byStream) {
    const sequences = list.map((r) => r.sequence).sort((x, y) => x - y);
    sequences.forEach((seq, i) => {
      if (seq !== i) {
        throw new Error(
          `clustering replay: stream "${streamName}" has non-contiguous sequence ` +
            `(expected ${i}, got ${seq})`,
        );
      }
    });
  }

  const orderedPayloads = <T>(streamName: string): T[] =>
    (byStream.get(streamName) ?? [])
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((r) => deepFreeze(deepClone(r.payload)) as T);

  return deepFreeze({
    membershipEvents: Object.freeze(
      orderedPayloads<ClusterMembershipEvent>(CLUSTER_MEMBERSHIP_EVENTS_STREAM),
    ),
    dedupeDecisions: Object.freeze(
      orderedPayloads<DedupeDecision>(CLUSTER_DEDUPE_DECISIONS_STREAM),
    ),
  });
};

export interface CorrectionReferenceCheck {
  readonly ok: boolean;

  readonly unresolvedCorrectionIds: readonly string[];
}

export const validateCorrectionReferences = (
  membershipEvents: readonly ClusterMembershipEvent[],
): CorrectionReferenceCheck => {
  const addedKeys = new Set<string>();
  const unresolved: string[] = [];
  for (const e of membershipEvents) {
    const key = `${e.clusterId}::${e.itemId}`;
    if (e.eventType === 'added') {
      addedKeys.add(key);
    } else if (!addedKeys.has(key)) {
      unresolved.push(e.membershipEventId);
    }
  }
  return { ok: unresolved.length === 0, unresolvedCorrectionIds: Object.freeze(unresolved) };
};

export const replayClusterHistory = (
  records: readonly PersistedRecord[],
): ClusterPersistenceSnapshot => {
  for (const record of records) {
    if (!isClusterStreamName(record.streamName)) {
      throw new Error(
        `clustering replay: unknown stream "${record.streamName}" is not a clustering ` +
          `stream (expected one of cluster-membership-events / cluster-dedupe-decisions)`,
      );
    }
  }
  const snapshot = buildClusterSnapshot(records);
  const check = validateCorrectionReferences(snapshot.membershipEvents);
  if (!check.ok) {
    throw new Error(
      `clustering replay: unresolved correction event(s) ` +
        `[${check.unresolvedCorrectionIds.join(', ')}] reference no prior added member`,
    );
  }
  return snapshot;
};

export const currentConfirmedMembership = (
  membershipEvents: readonly ClusterMembershipEvent[],
): ReadonlyMap<string, readonly string[]> => {
  const latest = new Map<string, ClusterMembershipEvent>();
  for (const e of membershipEvents) latest.set(`${e.clusterId}::${e.itemId}`, e);

  const byCluster = new Map<string, string[]>();
  for (const e of latest.values()) {
    if (e.eventType !== 'added') continue;
    const list = byCluster.get(e.clusterId) ?? [];
    list.push(e.itemId);
    byCluster.set(e.clusterId, list);
  }

  const out = new Map<string, readonly string[]>();
  for (const [clusterId, itemIds] of byCluster) {
    out.set(clusterId, Object.freeze([...itemIds].sort()));
  }
  return out;
};
