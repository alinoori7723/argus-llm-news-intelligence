import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_MUTATION_METHODS,
  InMemoryAppendOnlyPersistenceStore,
  PERSISTENCE_CONTRACT_VERSION,
  canonicalize,
  findMutationMethods,
  fixedPersistenceClock,
  isAppendOnly,
  payloadHashOf,
  type AppendRecordInput,
} from '@/domain/persistence';

const CLOCK = fixedPersistenceClock(Date.parse('2026-06-03T00:00:00.000Z'));

const input = (over: Partial<AppendRecordInput> = {}): AppendRecordInput => ({
  recordId: 'r-1',
  streamName: 'demo_stream',
  schemaVersion: 'demo-payload-v1',
  producerVersion: 'phase-2-13-test',
  sourcePhase: 'phase-2-13',
  payload: { value: 1 },
  ...over,
});

const freshStore = () => new InMemoryAppendOnlyPersistenceStore(CLOCK);

describe('persistence append — record envelope + deterministic sequence', () => {
  it('append builds an immutable envelope with sequence 0 + contract version', () => {
    const store = freshStore();
    const rec = store.append(input());
    expect(rec.recordId).toBe('r-1');
    expect(rec.streamName).toBe('demo_stream');
    expect(rec.sequence).toBe(0);
    expect(rec.recordedAt).toBe('2026-06-03T00:00:00.000Z');
    expect(rec.schemaVersion).toBe('demo-payload-v1');
    expect(rec.producerVersion).toBe('phase-2-13-test');
    expect(rec.sourcePhase).toBe('phase-2-13');
    expect(rec.contractVersion).toBe(PERSISTENCE_CONTRACT_VERSION);
    expect(rec.payloadHash).toBe(payloadHashOf({ value: 1 }));
  });

  it('explicit recordedAt wins over the clock; missing + no clock throws', () => {
    const store = freshStore();
    const rec = store.append(input({ recordId: 'r-x', recordedAt: '2020-01-01T00:00:00.000Z' }));
    expect(rec.recordedAt).toBe('2020-01-01T00:00:00.000Z');

    const noClock = new InMemoryAppendOnlyPersistenceStore();
    expect(() => noClock.append(input({ recordId: 'r-y' }))).toThrow(/recordedAt missing/);
  });

  it('sequence increments deterministically per stream; streams are independent', () => {
    const store = freshStore();
    store.append(input({ recordId: 'a-0', streamName: 'A' }));
    store.append(input({ recordId: 'a-1', streamName: 'A' }));
    store.append(input({ recordId: 'b-0', streamName: 'B' }));
    expect(store.readStream('A').map((r) => r.sequence)).toEqual([0, 1]);
    expect(store.readStream('B').map((r) => r.sequence)).toEqual([0]);
  });

  it('streamKey forms an independent sub-stream sequence', () => {
    const store = freshStore();
    store.append(input({ recordId: 'k1-0', streamName: 'S', streamKey: 'k1' }));
    store.append(input({ recordId: 'k2-0', streamName: 'S', streamKey: 'k2' }));
    store.append(input({ recordId: 'k1-1', streamName: 'S', streamKey: 'k1' }));
    expect(store.readStream('S', 'k1').map((r) => r.sequence)).toEqual([0, 1]);
    expect(store.readStream('S', 'k2').map((r) => r.sequence)).toEqual([0]);
    expect(store.readStream('S').length).toBe(3);
  });

  it('payloadHash is canonical (key-order independent) + distinguishes payloads', () => {
    expect(payloadHashOf({ a: 1, b: 2 })).toBe(payloadHashOf({ b: 2, a: 1 }));
    expect(payloadHashOf({ a: 1 })).not.toBe(payloadHashOf({ a: 2 }));
    expect(canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });
});

describe('persistence append — append-only never overwrites', () => {
  it('multiple appends to the same stream preserve ALL records', () => {
    const store = freshStore();
    for (let i = 0; i < 5; i += 1) {
      store.append(input({ recordId: `r-${i}`, payload: { value: i } }));
    }
    expect(store.readAll()).toHaveLength(5);
    expect(store.readAll().map((r) => (r.payload as { value: number }).value)).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });

  it('duplicate recordId is rejected (append-only); store is unchanged', () => {
    const store = freshStore();
    store.append(input({ recordId: 'dup' }));
    expect(() => store.append(input({ recordId: 'dup' }))).toThrow(/duplicate recordId/);
    expect(store.readAll()).toHaveLength(1);
  });
});

describe('persistence appendBatch — atomic all-or-nothing', () => {
  it('appendBatch commits all valid records', () => {
    const store = freshStore();
    const out = store.appendBatch([input({ recordId: 'b-0' }), input({ recordId: 'b-1' })]);
    expect(out).toHaveLength(2);
    expect(store.readAll().map((r) => r.sequence)).toEqual([0, 1]);
  });

  it('a duplicate recordId WITHIN the batch fails and appends NOTHING', () => {
    const store = freshStore();
    expect(() =>
      store.appendBatch([input({ recordId: 'same' }), input({ recordId: 'same' })]),
    ).toThrow(/duplicate recordId/);
    expect(store.readAll()).toHaveLength(0);
  });

  it('an invalid record in the batch fails and appends NOTHING', () => {
    const store = freshStore();
    expect(() => store.appendBatch([input({ recordId: 'ok' }), input({ recordId: '' })])).toThrow();
    expect(store.readAll()).toHaveLength(0);
  });

  it('a batch colliding with EXISTING history fails and leaves history intact', () => {
    const store = freshStore();
    store.append(input({ recordId: 'existing' }));
    expect(() =>
      store.appendBatch([input({ recordId: 'new' }), input({ recordId: 'existing' })]),
    ).toThrow(/duplicate recordId/);
    expect(store.readAll().map((r) => r.recordId)).toEqual(['existing']);
  });
});

describe('persistence immutability — no mutation bypass', () => {
  it('returned record + payload are deep-frozen', () => {
    const store = freshStore();
    const rec = store.append(input({ payload: { nested: { x: 1 } } }));
    expect(Object.isFrozen(rec)).toBe(true);
    expect(Object.isFrozen(rec.payload)).toBe(true);
    expect(Object.isFrozen((rec.payload as { nested: object }).nested)).toBe(true);
  });

  it('mutating a returned payload does NOT change stored data', () => {
    const store = freshStore();
    const rec = store.append(input({ payload: { title: 'orig' } }));
    try {
      (rec.payload as { title: string }).title = 'HACKED';
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
    }
    expect((store.readAll()[0].payload as { title: string }).title).toBe('orig');
  });

  it('mutating the CALLER input payload after append does NOT change stored data', () => {
    const store = freshStore();
    const payload = { title: 'orig', tags: ['a'] };
    store.append(input({ recordId: 'clone-test', payload }));
    payload.title = 'mutated';
    payload.tags.push('b');
    expect(store.readStream('demo_stream')[0].payload).toEqual({
      title: 'orig',
      tags: ['a'],
    });
  });

  it('snapshot is frozen and reflects all history in canonical order', () => {
    const store = freshStore();
    store.append(input({ recordId: 's-1', streamName: 'B' }));
    store.append(input({ recordId: 's-0', streamName: 'A' }));
    const snap = store.snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.records)).toBe(true);
    expect(snap.records.map((r) => r.streamName)).toEqual(['A', 'B']);
    expect(snap.contractVersion).toBe(PERSISTENCE_CONTRACT_VERSION);
  });
});

describe('persistence append-only enforcement — no mutation API exists', () => {
  it('the in-memory store exposes NONE of the forbidden mutation methods', () => {
    const store = freshStore();
    expect(findMutationMethods(store)).toEqual([]);
    expect(isAppendOnly(store)).toBe(true);
    for (const method of FORBIDDEN_MUTATION_METHODS) {
      expect((store as unknown as Record<string, unknown>)[method]).toBeUndefined();
    }
  });

  it('the public store surface is append/read/replay/snapshot only', () => {
    const store = freshStore();
    const proto = Object.getPrototypeOf(store) as object;
    const methods = Object.getOwnPropertyNames(proto).filter(
      (n) =>
        n !== 'constructor' &&
        typeof (store as unknown as Record<string, unknown>)[n] === 'function',
    );
    expect(methods.sort()).toEqual(
      ['append', 'appendBatch', 'readAll', 'readStream', 'snapshot'].sort(),
    );
  });
});

describe('persistence sample adapters (test-only; existing record shapes)', () => {
  it('wraps a recorded-source-payload-like record into the envelope', () => {
    const store = freshStore();
    const rec = store.append({
      recordId: 'pay-fed_press_all-0',
      streamName: 'recorded_source_payload',
      streamKey: 'fed_press_all',
      schemaVersion: 'raw-source-payload-v1',
      producerVersion: 'fetch-contract-v1',
      sourcePhase: 'phase-2-11',
      reason: 'recorded fixture replay',
      payload: { sourceId: 'fed_press_all', byteLength: 14925, status: 'recorded' },
    });
    expect(rec.streamKey).toBe('fed_press_all');
    expect(rec.payloadHash).toBe(
      payloadHashOf({ sourceId: 'fed_press_all', byteLength: 14925, status: 'recorded' }),
    );
  });

  it('wraps a cluster-membership-like record into the envelope', () => {
    const store = freshStore();
    const rec = store.append({
      recordId: 'cme-1',
      streamName: 'cluster_membership',
      schemaVersion: 'cluster-rule-v1',
      producerVersion: 'phase-2-3',
      sourcePhase: 'phase-2-13',
      payload: {
        clusterId: 'ccl-it.a1',
        itemId: 'it.a2',
        eventType: 'added',
        reasonType: 'canonical_url_exact',
      },
    });
    expect(rec.streamName).toBe('cluster_membership');
    expect(rec.sequence).toBe(0);
  });
});
