import { deepClone, deepFreeze, type PersistedRecord } from '../persistence';
import type {
  IngestionRun,
  MalformedSourceItem,
  NormalizedIngestedItem,
  RawSourcePayload,
} from './types';
import {
  INGESTION_MALFORMED_ITEMS_STREAM,
  INGESTION_NORMALIZED_ITEMS_STREAM,
  INGESTION_RAW_PAYLOADS_STREAM,
  INGESTION_RUNS_STREAM,
  ingestionStreamOrderIndex,
  isIngestionStreamName,
} from './ingestionPersistenceStreams';

export interface IngestionPersistenceSnapshot {
  readonly rawPayloads: readonly RawSourcePayload[];
  readonly normalizedItems: readonly NormalizedIngestedItem[];
  readonly malformedItems: readonly MalformedSourceItem[];
  readonly runs: readonly IngestionRun[];
}

export const compareIngestionRecordsGlobally = (a: PersistedRecord, b: PersistedRecord): number => {
  if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? -1 : 1;
  const sa = ingestionStreamOrderIndex(a.streamName);
  const sb = ingestionStreamOrderIndex(b.streamName);
  if (sa !== sb) return sa - sb;
  if (a.sequence !== b.sequence) return a.sequence - b.sequence;
  if (a.recordId !== b.recordId) return a.recordId < b.recordId ? -1 : 1;
  return 0;
};

export const orderIngestionRecordsGlobally = (
  records: readonly PersistedRecord[],
): PersistedRecord[] => [...records].sort(compareIngestionRecordsGlobally);

export const buildIngestionSnapshot = (
  records: readonly PersistedRecord[],
): IngestionPersistenceSnapshot => {
  const seenIds = new Set<string>();
  const byStream = new Map<string, PersistedRecord[]>();

  for (const record of records) {
    if (!isIngestionStreamName(record.streamName)) continue;
    if (seenIds.has(record.recordId)) {
      throw new Error(`ingestion replay: duplicate recordId "${record.recordId}" in history`);
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
          `ingestion replay: stream "${streamName}" has non-contiguous sequence ` +
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
    rawPayloads: Object.freeze(orderedPayloads<RawSourcePayload>(INGESTION_RAW_PAYLOADS_STREAM)),
    normalizedItems: Object.freeze(
      orderedPayloads<NormalizedIngestedItem>(INGESTION_NORMALIZED_ITEMS_STREAM),
    ),
    malformedItems: Object.freeze(
      orderedPayloads<MalformedSourceItem>(INGESTION_MALFORMED_ITEMS_STREAM),
    ),
    runs: Object.freeze(orderedPayloads<IngestionRun>(INGESTION_RUNS_STREAM)),
  });
};

export const replayIngestionHistory = (
  records: readonly PersistedRecord[],
): IngestionPersistenceSnapshot => {
  for (const record of records) {
    if (!isIngestionStreamName(record.streamName)) {
      throw new Error(
        `ingestion replay: unknown stream "${record.streamName}" is not an ingestion ` +
          `stream (expected one of ingestion-raw-payloads / ingestion-normalized-items / ` +
          `ingestion-malformed-items / ingestion-runs)`,
      );
    }
  }
  return buildIngestionSnapshot(records);
};

export interface IngestionLinkageResult {
  readonly ok: boolean;

  readonly unresolvedItemIds: readonly string[];
}

export const resolveIngestionLinkage = (
  snapshot: IngestionPersistenceSnapshot,
): IngestionLinkageResult => {
  const rawIds = new Set(snapshot.rawPayloads.map((p) => p.rawPayloadId));
  const unresolvedItemIds = snapshot.normalizedItems
    .filter((n) => !rawIds.has(n.rawPayloadId))
    .map((n) => n.itemId);
  return {
    ok: unresolvedItemIds.length === 0,
    unresolvedItemIds: Object.freeze(unresolvedItemIds),
  };
};
