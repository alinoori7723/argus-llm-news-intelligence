import {
  PERSISTENCE_CONTRACT_VERSION,
  type AppendRecordInput,
  type PersistedRecord,
  type PersistenceClock,
} from './types';

export const fixedPersistenceClock = (instantMs: number): PersistenceClock => ({
  now: () => instantMs,
});

export const isoFromEpochMs = (ms: number): string => new Date(ms).toISOString();

export const streamIdOf = (streamName: string, streamKey?: string): string =>
  streamKey === undefined ? streamName : `${streamName}::${streamKey}`;

export const deterministicHash = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const canonicalize = (value: unknown): string => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`;
  }
  return 'null';
};

export const payloadHashOf = (payload: unknown): string => deterministicHash(canonicalize(payload));

export const deepClone = <T>(value: T): T => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => deepClone(v)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = deepClone(v);
  }
  return out as T;
};

export const deepFreeze = <T>(value: T): T => {
  if (value === null || typeof value !== 'object') return value;
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  }
  return Object.freeze(value);
};

export const buildPersistedRecord = <TPayload>(
  input: AppendRecordInput<TPayload>,
  sequence: number,
  recordedAt: string,
): PersistedRecord<TPayload> => {
  const requireField = (name: string, v: unknown): void => {
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error(`persistence: invalid append input — "${name}" is required`);
    }
  };
  requireField('recordId', input.recordId);
  requireField('streamName', input.streamName);
  requireField('schemaVersion', input.schemaVersion);
  requireField('producerVersion', input.producerVersion);
  requireField('sourcePhase', input.sourcePhase);
  requireField('recordedAt', recordedAt);
  if (input.streamKey !== undefined) requireField('streamKey', input.streamKey);
  if (!('payload' in input) || input.payload === undefined) {
    throw new Error('persistence: invalid append input — "payload" is required');
  }

  const payload = deepFreeze(deepClone(input.payload));
  const record: PersistedRecord<TPayload> = {
    recordId: input.recordId,
    streamName: input.streamName,
    ...(input.streamKey !== undefined ? { streamKey: input.streamKey } : {}),
    sequence,
    recordedAt,
    schemaVersion: input.schemaVersion,
    producerVersion: input.producerVersion,
    payloadHash: payloadHashOf(input.payload),
    sourcePhase: input.sourcePhase,
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    payload,
    contractVersion: PERSISTENCE_CONTRACT_VERSION,
  };
  return deepFreeze(record);
};

export const resolveRecordedAt = (input: AppendRecordInput, clock?: PersistenceClock): string => {
  if (input.recordedAt !== undefined) return input.recordedAt;
  if (clock) return isoFromEpochMs(clock.now());
  throw new Error('persistence: recordedAt missing and no clock injected — supply one explicitly');
};

export const canonicalRecordOrder = (a: PersistedRecord, b: PersistedRecord): number => {
  if (a.streamName !== b.streamName) return a.streamName < b.streamName ? -1 : 1;
  const ak = a.streamKey ?? '';
  const bk = b.streamKey ?? '';
  if (ak !== bk) return ak < bk ? -1 : 1;
  return a.sequence - b.sequence;
};
