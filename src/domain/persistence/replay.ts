import { canonicalRecordOrder, deepClone, deepFreeze, streamIdOf } from './appendOnlyStore';
import { InMemoryAppendOnlyPersistenceStore } from './inMemoryAppendOnlyStore';
import {
  PERSISTENCE_CONTRACT_VERSION,
  type AppendRecordInput,
  type PersistedRecord,
  type PersistenceClock,
  type PersistenceSnapshot,
} from './types';

export const replay = (records: readonly PersistedRecord[]): PersistenceSnapshot => {
  const seenIds = new Set<string>();
  const byStream = new Map<string, PersistedRecord[]>();

  for (const record of records) {
    if (seenIds.has(record.recordId)) {
      throw new Error(`persistence replay: duplicate recordId "${record.recordId}" in history`);
    }
    seenIds.add(record.recordId);
    const streamId = streamIdOf(record.streamName, record.streamKey);
    const list = byStream.get(streamId) ?? [];
    list.push(deepClone(record));
    byStream.set(streamId, list);
  }

  for (const [streamId, list] of byStream) {
    const sequences = list.map((r) => r.sequence).sort((a, b) => a - b);
    sequences.forEach((seq, i) => {
      if (seq !== i) {
        throw new Error(
          `persistence replay: stream "${streamId}" has non-contiguous sequence ` +
            `(expected ${i}, got ${seq})`,
        );
      }
    });
  }

  const ordered = [...byStream.values()]
    .flat()
    .sort(canonicalRecordOrder)
    .map((r) => deepFreeze(r));

  return deepFreeze({
    records: Object.freeze(ordered),
    contractVersion: PERSISTENCE_CONTRACT_VERSION,
  });
};

export const replayInputs = (
  inputs: readonly AppendRecordInput[],
  clock?: PersistenceClock,
): InMemoryAppendOnlyPersistenceStore => {
  const store = new InMemoryAppendOnlyPersistenceStore(clock);
  store.appendBatch(inputs);
  return store;
};
