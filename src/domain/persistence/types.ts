export const PERSISTENCE_CONTRACT_VERSION = 'persistence-contract-v1';

export interface PersistenceClock {
  now(): number;
}

export interface AppendRecordInput<TPayload = unknown> {
  recordId: string;

  streamName: string;

  streamKey?: string;

  recordedAt?: string;

  schemaVersion: string;

  producerVersion: string;

  sourcePhase: string;

  reason?: string;

  payload: TPayload;
}

export interface PersistedRecord<TPayload = unknown> {
  readonly recordId: string;
  readonly streamName: string;
  readonly streamKey?: string;

  readonly sequence: number;
  readonly recordedAt: string;
  readonly schemaVersion: string;
  readonly producerVersion: string;

  readonly payloadHash: string;
  readonly sourcePhase: string;
  readonly reason?: string;
  readonly payload: TPayload;
  readonly contractVersion: string;
}

export interface PersistenceSnapshot {
  readonly records: readonly PersistedRecord[];
  readonly contractVersion: string;
}

export interface AppendOnlyPersistenceStore {
  append<TPayload>(input: AppendRecordInput<TPayload>): PersistedRecord<TPayload>;

  appendBatch(inputs: readonly AppendRecordInput[]): readonly PersistedRecord[];

  readStream(streamName: string, streamKey?: string): readonly PersistedRecord[];

  readAll(): readonly PersistedRecord[];

  snapshot(): PersistenceSnapshot;
}
