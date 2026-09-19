import { describe, expect, it } from 'vitest';
import {
  InMemoryAppendOnlyPersistenceStore,
  PERSISTENCE_CONTRACT_VERSION,
  fixedPersistenceClock,
  replay,
  replayInputs,
  type AppendRecordInput,
  type PersistedRecord,
} from '@/domain/persistence';

const CLOCK = fixedPersistenceClock(Date.parse('2026-06-03T00:00:00.000Z'));

const input = (over: Partial<AppendRecordInput> = {}): AppendRecordInput => ({
  recordId: 'r-1',
  streamName: 'demo',
  schemaVersion: 'demo-v1',
  producerVersion: 'phase-2-13-test',
  sourcePhase: 'phase-2-13',
  payload: { value: 1 },
  ...over,
});

const seededStore = () => {
  const store = new InMemoryAppendOnlyPersistenceStore(CLOCK);
  store.appendBatch([
    input({ recordId: 'a-0', streamName: 'A', payload: { v: 0 } }),
    input({ recordId: 'a-1', streamName: 'A', payload: { v: 1 } }),
    input({ recordId: 'b-0', streamName: 'B', payload: { v: 2 } }),
  ]);
  return store;
};

describe('persistence replay — determinism', () => {
  it('replaying the same record list produces the same snapshot', () => {
    const records = seededStore().readAll();
    expect(replay(records)).toEqual(replay(records));
  });

  it('replay of a store snapshot equals the store snapshot (round-trip)', () => {
    const store = seededStore();
    const snap = store.snapshot();
    expect(replay(snap.records)).toEqual(snap);
  });

  it('replayInputs reproduces identical sequences + hashes from inputs', () => {
    const inputs = [
      input({ recordId: 'a-0', streamName: 'A', payload: { v: 0 } }),
      input({ recordId: 'a-1', streamName: 'A', payload: { v: 1 } }),
    ];
    const a = replayInputs(inputs, CLOCK).snapshot();
    const b = replayInputs(inputs, CLOCK).snapshot();
    expect(a).toEqual(b);
    expect(a.records.map((r) => r.sequence)).toEqual([0, 1]);
  });

  it('empty replay is deterministic', () => {
    const snap = replay([]);
    expect(snap.records).toHaveLength(0);
    expect(snap.contractVersion).toBe(PERSISTENCE_CONTRACT_VERSION);
    expect(replay([])).toEqual(snap);
  });
});

describe('persistence replay — order is defined by sequence, not input order', () => {
  it('shuffling the INPUT array yields the SAME canonical snapshot', () => {
    const records = seededStore().readAll();
    const shuffled = [records[2], records[0], records[1]];
    expect(replay(shuffled)).toEqual(replay(records));
  });

  it('rejects non-contiguous per-stream sequence (could not be append-only history)', () => {
    const store = seededStore();
    const [first] = store.readStream('A');

    const broken: PersistedRecord[] = [{ ...first, recordId: 'a-1-only', sequence: 1 }];
    expect(() => replay(broken)).toThrow(/non-contiguous sequence/);
  });

  it('rejects duplicate recordId in replayed history', () => {
    const records = seededStore().readAll();
    expect(() => replay([records[0], records[0]])).toThrow(/duplicate recordId/);
  });
});

describe('persistence replay — non-mutating + immutable + stream-isolated', () => {
  it('replay does NOT mutate input records', () => {
    const records = seededStore().readAll();
    const before = JSON.stringify(records);
    replay(records);
    expect(JSON.stringify(records)).toBe(before);
  });

  it('replayed snapshot + records are frozen (no mutation bypass)', () => {
    const snap = replay(seededStore().readAll());
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.records)).toBe(true);
    expect(snap.records.every((r) => Object.isFrozen(r) && Object.isFrozen(r.payload))).toBe(true);
  });

  it('records from different streams do not leak into each other', () => {
    const snap = replay(seededStore().readAll());
    const a = snap.records.filter((r) => r.streamName === 'A');
    const b = snap.records.filter((r) => r.streamName === 'B');
    expect(a.map((r) => r.recordId)).toEqual(['a-0', 'a-1']);
    expect(b.map((r) => r.recordId)).toEqual(['b-0']);

    expect(a[0].payload).not.toBe(b[0].payload);
  });
});
