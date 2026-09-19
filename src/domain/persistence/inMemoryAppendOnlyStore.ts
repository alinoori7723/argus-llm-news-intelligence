import {
  buildPersistedRecord,
  canonicalRecordOrder,
  deepFreeze,
  resolveRecordedAt,
  streamIdOf,
} from './appendOnlyStore';
import {
  PERSISTENCE_CONTRACT_VERSION,
  type AppendOnlyPersistenceStore,
  type AppendRecordInput,
  type PersistedRecord,
  type PersistenceClock,
  type PersistenceSnapshot,
} from './types';

export class InMemoryAppendOnlyPersistenceStore implements AppendOnlyPersistenceStore {
  private readonly records: PersistedRecord[] = [];
  private readonly recordIds = new Set<string>();
  private readonly streamLengths = new Map<string, number>();

  constructor(private readonly clock?: PersistenceClock) {}

  append<TPayload>(input: AppendRecordInput<TPayload>): PersistedRecord<TPayload> {
    const [record] = this.appendBatch([input]);
    return record as PersistedRecord<TPayload>;
  }

  appendBatch(inputs: readonly AppendRecordInput[]): readonly PersistedRecord[] {
    const staged: PersistedRecord[] = [];
    const seenInBatch = new Set<string>();
    const stagedStreamLengths = new Map<string, number>();

    for (const input of inputs) {
      if (typeof input.recordId !== 'string' || input.recordId.length === 0) {
        throw new Error('persistence: invalid append input — "recordId" is required');
      }
      if (this.recordIds.has(input.recordId) || seenInBatch.has(input.recordId)) {
        throw new Error(
          `persistence: duplicate recordId "${input.recordId}" rejected (append-only)`,
        );
      }
      const streamId = streamIdOf(input.streamName, input.streamKey);
      const base = this.streamLengths.get(streamId) ?? 0;
      const sequence = base + (stagedStreamLengths.get(streamId) ?? 0);
      const recordedAt = resolveRecordedAt(input, this.clock);
      staged.push(buildPersistedRecord(input, sequence, recordedAt));
      seenInBatch.add(input.recordId);
      stagedStreamLengths.set(streamId, (stagedStreamLengths.get(streamId) ?? 0) + 1);
    }

    for (const record of staged) {
      this.records.push(record);
      this.recordIds.add(record.recordId);
      const streamId = streamIdOf(record.streamName, record.streamKey);
      this.streamLengths.set(streamId, (this.streamLengths.get(streamId) ?? 0) + 1);
    }
    return Object.freeze([...staged]);
  }

  readStream(streamName: string, streamKey?: string): readonly PersistedRecord[] {
    const out = this.records.filter(
      (r) => r.streamName === streamName && (streamKey === undefined || r.streamKey === streamKey),
    );
    out.sort(canonicalRecordOrder);
    return Object.freeze(out.map((r) => deepFreeze(r)));
  }

  readAll(): readonly PersistedRecord[] {
    const out = [...this.records].sort(canonicalRecordOrder);
    return Object.freeze(out.map((r) => deepFreeze(r)));
  }

  snapshot(): PersistenceSnapshot {
    return deepFreeze({
      records: this.readAll(),
      contractVersion: PERSISTENCE_CONTRACT_VERSION,
    });
  }
}
