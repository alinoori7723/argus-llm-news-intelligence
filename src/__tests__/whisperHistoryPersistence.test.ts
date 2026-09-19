import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FakeWhisperClock,
  PersistenceBackedWhisperHistoryStore,
  WHISPER_DECISIONS_STREAM,
  WHISPER_DISMISSALS_STREAM,
  WHISPER_INTERACTIONS_STREAM,
  WHISPER_RULE_VERSION,
  WHISPER_STREAM_ORDER,
  buildWhisperSnapshot,
  evaluateWhisperCandidate,
  isoFromMs,
  mapDecisionToInput,
  mapDismissalToInput,
  mapInteractionToInput,
  orderWhisperRecordsGlobally,
  recordWhisperInteraction,
  replayWhisperHistory,
  type WhisperDecisionRecord,
  type WhisperDismissalRecord,
  type WhisperInteractionIntent,
} from '@/domain/whispers';
import type { WhisperInteractionRecord } from '@/domain/whispers';
import { DISMISSAL_QUIET_WINDOW_MINUTES } from '@/domain/whispers';
import {
  InMemoryAppendOnlyPersistenceStore,
  type AppendOnlyPersistenceStore,
  type PersistedRecord,
} from '@/domain/persistence';
import { BASE_MS, clusterCandidate, itemCandidate } from './_whisperHelpers';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const make = (clock?: FakeWhisperClock) => {
  const backing = new InMemoryAppendOnlyPersistenceStore();
  const store = new PersistenceBackedWhisperHistoryStore(backing, clock);
  return { backing, store };
};

const intent = (over: Partial<WhisperInteractionIntent> = {}): WhisperInteractionIntent => ({
  intentId: 'int.1',
  interactionType: 'dismiss',
  targetType: 'item',
  targetId: 'it.1',
  decisionId: 'dec.1',
  ...over,
});

const decisionRecord = (over: Partial<WhisperDecisionRecord> = {}): WhisperDecisionRecord => ({
  recordId: 'rec-d',
  decisionId: 'dec-d',
  candidateId: 'cand-1',
  candidateSourceType: 'item',
  decision: 'whisper',
  createdAt: isoFromMs(BASE_MS),
  ruleVersion: WHISPER_RULE_VERSION,
  reason: 'whisper: x',
  ...over,
});

const dismissalRecord = (over: Partial<WhisperDismissalRecord> = {}): WhisperDismissalRecord => ({
  dismissalId: 'wdis-d',
  targetType: 'item',
  targetId: 'it.1',
  dismissedAt: isoFromMs(BASE_MS),
  quietUntil: isoFromMs(BASE_MS + DISMISSAL_QUIET_WINDOW_MINUTES * 60_000),
  ruleVersion: WHISPER_RULE_VERSION,
  ...over,
});

const interactionRecord = (
  over: Partial<WhisperInteractionRecord> = {},
): WhisperInteractionRecord => ({
  recordId: 'wint-i',
  intentId: 'i.1',
  interactionType: 'mark_seen',
  targetType: 'item',
  targetId: 'it.1',
  recordedAt: isoFromMs(BASE_MS),
  ruleVersion: WHISPER_RULE_VERSION,
  ...over,
});

describe('A. persistence-backed store maps to three separate streams', () => {
  it('decision → whisper-decisions; dismissal → whisper-dismissals; interaction → whisper-interactions', () => {
    const clock = new FakeWhisperClock(BASE_MS);
    const { backing, store } = make();

    evaluateWhisperCandidate({ candidate: clusterCandidate(3), historyStore: store, clock });
    recordWhisperInteraction({ intent: intent({ intentId: 'd1' }), clock, historyStore: store });
    recordWhisperInteraction({
      intent: intent({ intentId: 's1', interactionType: 'mark_seen' }),
      clock,
      historyStore: store,
    });

    expect(backing.readStream(WHISPER_DECISIONS_STREAM)).toHaveLength(1);
    expect(backing.readStream(WHISPER_DISMISSALS_STREAM)).toHaveLength(1);
    expect(backing.readStream(WHISPER_INTERACTIONS_STREAM)).toHaveLength(1);

    expect(WHISPER_STREAM_ORDER).toEqual([
      'whisper-decisions',
      'whisper-dismissals',
      'whisper-interactions',
    ]);
  });

  it('a dismissal never appears in the decisions stream (cannot be counted as a decision/delivery)', () => {
    const clock = new FakeWhisperClock(BASE_MS);
    const { backing, store } = make();
    recordWhisperInteraction({ intent: intent(), clock, historyStore: store });
    expect(backing.readStream(WHISPER_DECISIONS_STREAM)).toHaveLength(0);
    expect(backing.readStream(WHISPER_DISMISSALS_STREAM)).toHaveLength(1);
  });

  it('mark_seen / open_audit / open_evidence go to interactions only (never dismissal/decision)', () => {
    const clock = new FakeWhisperClock(BASE_MS);
    const { backing, store } = make();
    for (const [intentId, t] of [
      ['s', 'mark_seen'],
      ['a', 'open_audit'],
      ['e', 'open_evidence'],
    ] as const) {
      recordWhisperInteraction({
        intent: intent({ intentId, interactionType: t }),
        clock,
        historyStore: store,
      });
    }
    expect(backing.readStream(WHISPER_INTERACTIONS_STREAM)).toHaveLength(3);
    expect(backing.readStream(WHISPER_DISMISSALS_STREAM)).toHaveLength(0);
    expect(backing.readStream(WHISPER_DECISIONS_STREAM)).toHaveLength(0);
  });

  it('getSnapshot reconstructs the three domain-record arrays through WhisperHistoryStore', () => {
    const clock = new FakeWhisperClock(BASE_MS);
    const { store } = make();
    evaluateWhisperCandidate({ candidate: clusterCandidate(3), historyStore: store, clock });
    recordWhisperInteraction({ intent: intent({ intentId: 'd1' }), clock, historyStore: store });
    recordWhisperInteraction({
      intent: intent({ intentId: 's1', interactionType: 'mark_seen' }),
      clock,
      historyStore: store,
    });
    const snap = store.getSnapshot();
    expect(snap.decisionRecords).toHaveLength(1);
    expect(snap.dismissalRecords).toHaveLength(1);
    expect(snap.interactionRecords).toHaveLength(1);
    expect(snap.ruleVersion).toBe(WHISPER_RULE_VERSION);
  });
});

describe('B. recordedAt is a pass-through of the domain record clock stamp', () => {
  it('decision envelope.recordedAt equals the decision record createdAt', () => {
    const clock = new FakeWhisperClock(BASE_MS);
    const { backing, store } = make();
    evaluateWhisperCandidate({ candidate: clusterCandidate(3), historyStore: store, clock });
    const env = backing.readStream(WHISPER_DECISIONS_STREAM)[0];
    const payload = env.payload as WhisperDecisionRecord;
    expect(env.recordedAt).toBe(payload.createdAt);
    expect(env.recordedAt).toBe(isoFromMs(BASE_MS));
  });

  it('dismissal envelope.recordedAt equals the dismissal record dismissedAt', () => {
    const clock = new FakeWhisperClock(BASE_MS);
    const { backing, store } = make();
    recordWhisperInteraction({ intent: intent(), clock, historyStore: store });
    const env = backing.readStream(WHISPER_DISMISSALS_STREAM)[0];
    const payload = env.payload as WhisperDismissalRecord;
    expect(env.recordedAt).toBe(payload.dismissedAt);
    expect(env.recordedAt).toBe(isoFromMs(BASE_MS));
  });

  it('interaction envelope.recordedAt equals the interaction record recordedAt', () => {
    const clock = new FakeWhisperClock(BASE_MS);
    const { backing, store } = make();
    recordWhisperInteraction({
      intent: intent({ interactionType: 'mark_seen' }),
      clock,
      historyStore: store,
    });
    const env = backing.readStream(WHISPER_INTERACTIONS_STREAM)[0];
    const payload = env.payload as WhisperInteractionRecord;
    expect(env.recordedAt).toBe(payload.recordedAt);
    expect(env.recordedAt).toBe(isoFromMs(BASE_MS));
  });

  it('the mapping never samples a clock of its own (no Date.now / argless new Date in mapping source)', () => {
    const raw = readFileSync(
      resolve(repoRoot, 'src/domain/whispers/whisperPersistenceMapping.ts'),
      'utf8',
    );
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(code).not.toMatch(/Date\.now\s*\(/);
    expect(code).not.toMatch(/new\s+Date\s*\(\s*\)/);
    expect(code).not.toMatch(/\bMath\.random\b/);
    expect(code).not.toMatch(/randomUUID|\buuid\b/);

    expect(code).not.toMatch(/WhisperClock/);
  });
});

describe('C. deterministic recordId includes the per-stream sequence', () => {
  it('two identical interactions at the SAME recordedAt both persist as distinct records', () => {
    const backing = new InMemoryAppendOnlyPersistenceStore();
    const store = new PersistenceBackedWhisperHistoryStore(backing);

    const a = interactionRecord();
    const b = interactionRecord();
    store.appendInteraction(a);
    store.appendInteraction(b);
    const recs = backing.readStream(WHISPER_INTERACTIONS_STREAM);
    expect(recs).toHaveLength(2);
    expect(recs[0].recordId).not.toBe(recs[1].recordId);
    expect(recs.map((r) => r.sequence)).toEqual([0, 1]);
  });

  it('two legitimate decisions for the same candidate at the same recordedAt do not collide', () => {
    const clock = new FakeWhisperClock(BASE_MS);
    const { backing, store } = make();

    evaluateWhisperCandidate({
      candidate: clusterCandidate(3, { candidateId: 'cand-x', clusterId: 'ccl.x' }),
      historyStore: store,
      clock,
    });
    evaluateWhisperCandidate({
      candidate: clusterCandidate(3, { candidateId: 'cand-x', clusterId: 'ccl.x' }),
      historyStore: store,
      clock,
    });
    const recs = backing.readStream(WHISPER_DECISIONS_STREAM);
    expect(recs).toHaveLength(2);
    expect(recs[0].recordId).not.toBe(recs[1].recordId);
  });

  it('the recordId matches the required per-stream pattern', () => {
    expect(mapDecisionToInput(decisionRecord(), 7).recordId).toBe(
      `whisper-decision:7:cand-1:${WHISPER_RULE_VERSION}`,
    );
    expect(mapDismissalToInput(dismissalRecord(), 3).recordId).toBe(
      `whisper-dismissal:3:item:it.1:${WHISPER_RULE_VERSION}`,
    );
    expect(mapInteractionToInput(interactionRecord(), 5).recordId).toBe(
      `whisper-interaction:5:mark_seen:item:it.1:${WHISPER_RULE_VERSION}`,
    );
  });

  it('a TRUE duplicate persisted recordId is still rejected by the underlying store', () => {
    const backing = new InMemoryAppendOnlyPersistenceStore();
    const input = mapInteractionToInput(interactionRecord(), 0);
    backing.append(input);
    expect(() => backing.append(input)).toThrow(/duplicate recordId/);
  });
});

describe('D. deterministic global cross-stream ordering', () => {
  const envOf = (
    records: { stream: 'd' | 'x' | 'i'; rec: unknown; seq: number }[],
  ): PersistedRecord[] => {
    const backing = new InMemoryAppendOnlyPersistenceStore();

    for (const { stream, rec, seq } of records) {
      void seq;
      if (stream === 'd')
        backing.append(
          mapDecisionToInput(
            rec as WhisperDecisionRecord,
            backing.readStream(WHISPER_DECISIONS_STREAM).length,
          ),
        );
      else if (stream === 'x')
        backing.append(
          mapDismissalToInput(
            rec as WhisperDismissalRecord,
            backing.readStream(WHISPER_DISMISSALS_STREAM).length,
          ),
        );
      else
        backing.append(
          mapInteractionToInput(
            rec as WhisperInteractionRecord,
            backing.readStream(WHISPER_INTERACTIONS_STREAM).length,
          ),
        );
    }
    return [...backing.readAll()];
  };

  it('recordedAt ascending dominates stream order AND per-stream sequence', () => {
    const T1 = isoFromMs(BASE_MS);
    const T2 = isoFromMs(BASE_MS + 60_000);
    const records = envOf([
      { stream: 'd', rec: decisionRecord({ createdAt: T2 }), seq: 0 },
      { stream: 'x', rec: dismissalRecord({ dismissedAt: T1 }), seq: 0 },
    ]);
    const ordered = orderWhisperRecordsGlobally(records);

    expect(ordered.map((r) => r.streamName)).toEqual([
      WHISPER_DISMISSALS_STREAM,
      WHISPER_DECISIONS_STREAM,
    ]);
  });

  it('identical recordedAt is broken deterministically by stream order then sequence', () => {
    const T = isoFromMs(BASE_MS);
    const records = envOf([
      { stream: 'x', rec: dismissalRecord({ dismissedAt: T }), seq: 0 },
      { stream: 'd', rec: decisionRecord({ createdAt: T }), seq: 0 },
      { stream: 'i', rec: interactionRecord({ recordedAt: T }), seq: 0 },
    ]);
    const ordered = orderWhisperRecordsGlobally(records);
    expect(ordered.map((r) => r.streamName)).toEqual([
      WHISPER_DECISIONS_STREAM,
      WHISPER_DISMISSALS_STREAM,
      WHISPER_INTERACTIONS_STREAM,
    ]);
  });

  it('shuffling the input order yields the SAME globally-ordered result (deterministic)', () => {
    const records = envOf([
      { stream: 'd', rec: decisionRecord({ createdAt: isoFromMs(BASE_MS + 3000) }), seq: 0 },
      { stream: 'x', rec: dismissalRecord({ dismissedAt: isoFromMs(BASE_MS + 1000) }), seq: 0 },
      { stream: 'i', rec: interactionRecord({ recordedAt: isoFromMs(BASE_MS + 2000) }), seq: 0 },
    ]);
    const a = orderWhisperRecordsGlobally(records).map((r) => r.recordId);
    const b = orderWhisperRecordsGlobally([records[2], records[0], records[1]]).map(
      (r) => r.recordId,
    );
    const c = orderWhisperRecordsGlobally([records[1], records[2], records[0]]).map(
      (r) => r.recordId,
    );
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
});

describe('E. replay from persisted records reproduces the snapshot', () => {
  const seeded = () => {
    const clock = new FakeWhisperClock(BASE_MS);
    const { backing, store } = make();
    evaluateWhisperCandidate({ candidate: clusterCandidate(3), historyStore: store, clock });
    recordWhisperInteraction({
      intent: intent({ intentId: 'd1', targetId: 'it.z' }),
      clock,
      historyStore: store,
    });
    recordWhisperInteraction({
      intent: intent({ intentId: 's1', interactionType: 'mark_seen', targetId: 'it.z' }),
      clock,
      historyStore: store,
    });
    return { backing, store };
  };

  it('replay(records) equals the direct getSnapshot()', () => {
    const { backing, store } = seeded();
    expect(replayWhisperHistory(backing.readAll())).toEqual(store.getSnapshot());
  });

  it('replay is deterministic and order-insensitive (shuffled input → same snapshot)', () => {
    const { backing } = seeded();
    const records = backing.readAll();
    const shuffled = [...records].reverse();
    expect(replayWhisperHistory(shuffled)).toEqual(replayWhisperHistory(records));
  });

  it('replay does NOT mutate the input records', () => {
    const { backing } = seeded();
    const records = backing.readAll();
    const before = JSON.stringify(records);
    replayWhisperHistory(records);
    expect(JSON.stringify(records)).toBe(before);
  });

  it('replayed snapshot + records are frozen (defensive)', () => {
    const { backing } = seeded();
    const snap = replayWhisperHistory(backing.readAll());
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.decisionRecords)).toBe(true);
    expect(snap.decisionRecords.every((r) => Object.isFrozen(r))).toBe(true);
    expect(snap.dismissalRecords.every((r) => Object.isFrozen(r))).toBe(true);
    expect(snap.interactionRecords.every((r) => Object.isFrozen(r))).toBe(true);
  });

  it('records from a foreign stream do NOT leak into Whisper state (getSnapshot ignores them)', () => {
    const clock = new FakeWhisperClock(BASE_MS);
    const backing: AppendOnlyPersistenceStore = new InMemoryAppendOnlyPersistenceStore();
    const store = new PersistenceBackedWhisperHistoryStore(backing);

    backing.append({
      recordId: 'foreign-0',
      streamName: 'cluster_membership',
      schemaVersion: 'x',
      producerVersion: 'x',
      sourcePhase: 'phase-2-14-test',
      payload: { clusterId: 'c', itemId: 'i' },
      recordedAt: isoFromMs(BASE_MS),
    });
    recordWhisperInteraction({
      intent: intent({ interactionType: 'mark_seen' }),
      clock,
      historyStore: store,
    });
    const snap = store.getSnapshot();
    expect(snap.decisionRecords).toHaveLength(0);
    expect(snap.dismissalRecords).toHaveLength(0);
    expect(snap.interactionRecords).toHaveLength(1);
  });

  it('replayWhisperHistory REJECTS an unknown stream with a deterministic reason', () => {
    const foreign: PersistedRecord = {
      recordId: 'foreign-0',
      streamName: 'cluster_membership',
      sequence: 0,
      recordedAt: isoFromMs(BASE_MS),
      schemaVersion: 'x',
      producerVersion: 'x',
      payloadHash: '0',
      sourcePhase: 'p',
      payload: {},
      contractVersion: 'persistence-contract-v1',
    };
    expect(() => replayWhisperHistory([foreign])).toThrow(/unknown stream/);
  });

  it('replay rejects duplicate recordId and non-contiguous per-stream sequence', () => {
    const { backing } = seeded();
    const records = backing.readAll();
    const decision = records.find((r) => r.streamName === WHISPER_DECISIONS_STREAM)!;
    expect(() => replayWhisperHistory([decision, decision])).toThrow(/duplicate recordId/);
    const broken: PersistedRecord = { ...decision, recordId: 'd-seq-1-only', sequence: 1 };
    expect(() => buildWhisperSnapshot([broken])).toThrow(/non-contiguous sequence/);
  });

  it('mutating a returned snapshot does not affect later reads', () => {
    const { store } = seeded();
    const snap = store.getSnapshot();
    try {
      (snap.interactionRecords as unknown as unknown[]).push({ tampered: true });
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
    }
    expect(store.getSnapshot().interactionRecords).toHaveLength(1);
  });
});

describe('F. pre-decision snapshot semantics (persistence-backed)', () => {
  it('the first eligible Whisper does not count itself; the decision is appended AFTER', () => {
    const clock = new FakeWhisperClock(BASE_MS);
    const { store } = make();
    const d = evaluateWhisperCandidate({
      candidate: clusterCandidate(3),
      historyStore: store,
      clock,
    });
    expect(d.decision).toBe('whisper');
    expect(d.rateLimitState.whispersLast15m).toBe(0);
    expect(store.decisionCount).toBe(1);
  });

  it('rate-limit / cooldown checks use the pre-decision committed history', () => {
    const clock = new FakeWhisperClock(BASE_MS);
    const { store } = make();
    const first = evaluateWhisperCandidate({
      candidate: clusterCandidate(3, { clusterId: 'ccl.a', sourceId: 'src.a' }),
      historyStore: store,
      clock,
    });
    const second = evaluateWhisperCandidate({
      candidate: clusterCandidate(3, { clusterId: 'ccl.b', sourceId: 'src.b' }),
      historyStore: store,
      clock,
    });
    expect(first.decision).toBe('whisper');
    expect(second.decision).toBe('hold');
    expect(store.decisionCount).toBe(2);
  });
});

describe('G. dismissal + quiet-window semantics (persistence-backed)', () => {
  it('dismiss writes ONLY to the dismissals stream (not decisions, not delivery)', () => {
    const clock = new FakeWhisperClock(BASE_MS);
    const { backing, store } = make();
    recordWhisperInteraction({ intent: intent(), clock, historyStore: store });
    expect(backing.readStream(WHISPER_DISMISSALS_STREAM)).toHaveLength(1);
    expect(backing.readStream(WHISPER_DECISIONS_STREAM)).toHaveLength(0);
  });

  it('repeated dismiss inside the active quiet window is idempotent and does NOT extend quietUntil', () => {
    const clock = new FakeWhisperClock(BASE_MS);
    const { store } = make();
    recordWhisperInteraction({ intent: intent({ intentId: 'a' }), clock, historyStore: store });
    const firstQuietUntil = store.getSnapshot().dismissalRecords[0].quietUntil;
    clock.advanceMinutes(30);
    const res2 = recordWhisperInteraction({
      intent: intent({ intentId: 'b' }),
      clock,
      historyStore: store,
    });
    expect(res2.status).toBe('ignored');
    expect(store.dismissalCount).toBe(1);
    expect(store.interactionCount).toBe(1);
    expect(store.getSnapshot().dismissalRecords[0].quietUntil).toBe(firstQuietUntil);
  });

  it('the quiet window holds a future decision, and advancing the clock releases it', () => {
    const clock = new FakeWhisperClock(BASE_MS);
    const { store } = make();
    recordWhisperInteraction({ intent: intent({ targetId: 'it.1' }), clock, historyStore: store });
    const held = evaluateWhisperCandidate({
      candidate: itemCandidate({ candidateId: 'c', itemId: 'it.1', priorityTier: 'P0' }),
      historyStore: store,
      clock,
    });
    expect(held.decision).toBe('hold');
    expect(held.reason).toContain('dismissal_quiet_window');

    clock.advanceMinutes(DISMISSAL_QUIET_WINDOW_MINUTES + 1);
    const released = evaluateWhisperCandidate({
      candidate: itemCandidate({ candidateId: 'c2', itemId: 'it.1', priorityTier: 'P0' }),
      historyStore: store,
      clock,
    });
    expect(released.decision).toBe('whisper');
  });

  it('mark_seen / open_audit / open_evidence do not create a quiet window and are not delivery/dismissal', () => {
    const clock = new FakeWhisperClock(BASE_MS);
    const { backing, store } = make();
    for (const [intentId, t] of [
      ['s', 'mark_seen'],
      ['a', 'open_audit'],
      ['e', 'open_evidence'],
    ] as const) {
      recordWhisperInteraction({
        intent: intent({ intentId, targetId: 'it.1', interactionType: t }),
        clock,
        historyStore: store,
      });
    }
    const decision = evaluateWhisperCandidate({
      candidate: itemCandidate({ candidateId: 'c', itemId: 'it.1', priorityTier: 'P0' }),
      historyStore: store,
      clock,
    });
    expect(decision.decision).toBe('whisper');
    expect(backing.readStream(WHISPER_DISMISSALS_STREAM)).toHaveLength(0);
    expect(backing.readStream(WHISPER_INTERACTIONS_STREAM)).toHaveLength(3);
  });
});

describe('H. runtime wiring: persistence-backed present, in-memory absent in active src', () => {
  const scanDir = (rel: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(join(repoRoot, rel), { withFileTypes: true })) {
      const relPath = join(rel, entry.name);
      if (entry.isDirectory()) {
        if (relPath === join('src', '__tests__')) continue;
        out.push(...scanDir(relPath));
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
        out.push(relPath);
      }
    }
    return out;
  };
  const activeSrc = scanDir('src');
  const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8');

  const LEGACY_DEF = join('src', 'domain', 'whispers', 'inMemoryWhisperHistoryStore.ts');

  it('the active Whispers bootstrap / bridge / session controller all wire the persistence-backed store', () => {
    for (const f of [
      'src/fixtures/whispers/whisperBootstrap.ts',
      'src/fixtures/whispers/whisperInteractionBootstrap.ts',
      'src/fixtures/whispers/whisperSessionBootstrap.ts',
    ]) {
      const code = read(f);
      expect(code).toMatch(/new PersistenceBackedWhisperHistoryStore\(/);
      expect(code).toMatch(/InMemoryAppendOnlyPersistenceStore/);
      expect(code).not.toMatch(/new InMemoryWhisperHistoryStore\(/);
    }
  });

  it('NO active non-test src file references InMemoryWhisperHistoryStore outside its definition', () => {
    const offenders = activeSrc.filter(
      (f) => f !== LEGACY_DEF && /\bInMemoryWhisperHistoryStore\b/.test(read(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('NO page/component imports a history store, the persistence store, the engine, or the interaction action', () => {
    const FORBIDDEN =
      /\bAppendOnlyPersistenceStore\b|\bInMemoryAppendOnlyPersistenceStore\b|\bPersistenceBackedWhisperHistoryStore\b|\bInMemoryWhisperHistoryStore\b|\bWhisperHistoryStore\b|\bevaluateWhisperCandidate\b|\bWhisperCandidate\b|\bselectWhisperDecisions\b|\brecordWhisperInteraction\b|\bprojectWhisperSessionView\b/;
    const offenders = [...scanDir('src/pages'), ...scanDir('src/components')].filter((f) =>
      FORBIDDEN.test(read(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('the WhispersPanel holds no local dismissed/seen state (no hide-by-local-state)', () => {
    const panel = read('src/components/WhispersPanel.tsx');

    expect(panel).not.toMatch(/useState/);
    expect(panel).not.toMatch(/dismissed(Ids|Set|Map)/i);
  });

  it('the legacy InMemoryWhisperHistoryStore remains available for isolated tests', () => {
    const def = read(LEGACY_DEF);
    expect(def).toMatch(/export class InMemoryWhisperHistoryStore/);
  });
});
