import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixedClock } from '@/domain/ingestion';
import {
  AppendOnlyClusterStore,
  CLUSTER_DEDUPE_DECISIONS_STREAM,
  CLUSTER_MEMBERSHIP_EVENTS_STREAM,
  CLUSTER_STREAM_ORDER,
  ConfirmedClusterEngine,
  PersistenceBackedClusterStore,
  buildClusterSnapshot,
  confirmedClusterForItem,
  confirmedClusterSize,
  confirmedClusters,
  currentConfirmedMembership,
  identityIndex,
  mapMembershipEventToInput,
  orderClusterRecordsGlobally,
  replayClusterHistory,
  toCanonicalIdentity,
  validateCorrectionReferences,
  type CanonicalIdentity,
  type ClusterMembershipEvent,
  type ClusterStore,
  type ConfirmedCluster,
} from '@/domain/clustering';
import { computePriorityForClusteredItem } from '@/domain/clustering';
import { buildConfirmedClusterDisplay } from '@/domain/display';
import { InMemoryAppendOnlyPersistenceStore, type PersistedRecord } from '@/domain/persistence';
import { annotateItems } from '@/domain/selectors';
import { FIXTURE_SNAPSHOT } from '@/fixtures/snapshot';
import { CLUSTER_A_ID, SCENARIO_IDENTITIES } from '@/fixtures/clustering/clusterScenario';
import { CLUSTERS_PAGE_VIEW } from '@/fixtures/clustering/clusteringBootstrap';
import type { SourceProfile } from '@/domain/types';
import Clusters from '@/pages/Clusters';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const INSTANT = '2026-05-31T09:30:00.000Z';
const CLOCK = fixedClock(INSTANT);

const newPersistenceStore = () => {
  const backing = new InMemoryAppendOnlyPersistenceStore();
  return { backing, store: new PersistenceBackedClusterStore(backing) };
};

const scenarioStore = () => {
  const { backing, store } = newPersistenceStore();
  const engine = new ConfirmedClusterEngine(store, CLOCK);
  const [A1, A2, A3, A4, A5, N1, N2] = SCENARIO_IDENTITIES;
  engine.addAll([A1, A2, A3, A4, N1, N2]);
  engine.add(A5);
  engine.removeMemberAsError(CLUSTER_A_ID, 'it.a4', 'duplicate AMP ingest removed');
  const identityById = identityIndex(SCENARIO_IDENTITIES);
  return { backing, store, identityById };
};

const manyMatching = (n: number): CanonicalIdentity[] =>
  Array.from({ length: n }, (_, i) => ({
    itemId: `it.b${String(i).padStart(2, '0')}`,
    sourceId: `src.${i}`,
    sourceItemId: `s-${i}`,
    url: 'https://news.example/same-story',
    canonicalUrl: 'https://news.example/same-story',
    normalizedTitle: undefined,
    dedupeHash: `h.${i}`,
    assetTags: ['DXY'],
    topicTags: ['central-bank'],
    observedAt: INSTANT,
    sourceEventTime: INSTANT,
    ruleVersion: 'dedupe-rule-v1',
  }));

describe('A. persistence-backed cluster store maps to its record sets 1:1', () => {
  it('the stream order is membership-events then dedupe-decisions', () => {
    expect(CLUSTER_STREAM_ORDER).toEqual(['cluster-membership-events', 'cluster-dedupe-decisions']);
  });

  it('added + correction events live in the membership stream; dedupe in its own stream', () => {
    const { backing } = scenarioStore();
    const membership = backing.readStream(CLUSTER_MEMBERSHIP_EVENTS_STREAM);
    const events = membership.map((r) => r.payload as ClusterMembershipEvent);
    expect(events.some((e) => e.eventType === 'added')).toBe(true);
    expect(events.some((e) => e.eventType === 'removed_as_error')).toBe(true);

    const corr = membership.find(
      (r) => (r.payload as ClusterMembershipEvent).eventType === 'removed_as_error',
    )!;
    expect(corr.recordId.startsWith('cluster-correction:')).toBe(true);
    const add = membership.find(
      (r) => (r.payload as ClusterMembershipEvent).eventType === 'added',
    )!;
    expect(add.recordId.startsWith('cluster-membership:')).toBe(true);

    expect(backing.readStream(CLUSTER_DEDUPE_DECISIONS_STREAM).length).toBeGreaterThan(0);
  });
});

describe('B. append-only correction replay (the heart of Phase 2.17)', () => {
  it('add → correct → shuffled replay → current confirmed count EXCLUDES the corrected member', () => {
    const { backing, store, identityById } = scenarioStore();

    const direct = confirmedClusters(store, identityById).find(
      (c) => c.clusterId === CLUSTER_A_ID,
    )!;
    expect(direct.confirmedMemberCount).toBe(4);
    expect(direct.confirmedMemberItemIds).not.toContain('it.a4');

    const shuffled = [...backing.readAll()].reverse();
    const membership = currentConfirmedMembership(replayClusterHistory(shuffled).membershipEvents);
    const replayedA = membership.get(CLUSTER_A_ID)!;
    expect(replayedA.length).toBe(4);
    expect(replayedA).not.toContain('it.a4');
    expect([...replayedA]).toEqual(direct.confirmedMemberItemIds);
  });

  it('both the original add event AND the correction event remain visible in history', () => {
    const { store } = scenarioStore();
    const a4Events = store.eventsForItem('it.a4');
    expect(a4Events.some((e) => e.eventType === 'added')).toBe(true);
    expect(a4Events.some((e) => e.eventType === 'removed_as_error')).toBe(true);
  });

  it('correction replay is deterministic regardless of persistence record order', () => {
    const { backing } = scenarioStore();
    const records = backing.readAll();
    const a = currentConfirmedMembership(replayClusterHistory(records).membershipEvents);
    const b = currentConfirmedMembership(
      replayClusterHistory([...records].reverse()).membershipEvents,
    );
    expect([...a.get(CLUSTER_A_ID)!]).toEqual([...b.get(CLUSTER_A_ID)!]);
  });

  it('a correction referencing no prior add is surfaced as unresolved (rejected, not ignored)', () => {
    const orphan: ClusterMembershipEvent = {
      membershipEventId: 'cme-orphan',
      clusterId: 'ccl-x',
      itemId: 'it.ghost',
      eventType: 'removed_as_error',
      reasonDetail: 'no prior add',
      ruleVersion: 'cluster-rule-v1',
      createdAt: INSTANT,
    };
    const check = validateCorrectionReferences([orphan]);
    expect(check.ok).toBe(false);
    expect(check.unresolvedCorrectionIds).toContain('cme-orphan');

    const backing = new InMemoryAppendOnlyPersistenceStore();
    backing.append(mapMembershipEventToInput(orphan, 0));
    expect(() => replayClusterHistory(backing.readAll())).toThrow(/unresolved correction/);
  });

  it('a duplicate correction (same member corrected twice) is idempotent in replay', () => {
    const { store } = scenarioStore();

    (store as ClusterStore).appendMembershipEvent({
      membershipEventId: store.nextId('cme'),
      clusterId: CLUSTER_A_ID,
      itemId: 'it.a4',
      eventType: 'removed_as_error',
      reasonDetail: 'second correction (idempotent)',
      ruleVersion: 'cluster-rule-v1',
      createdAt: INSTANT,
    });
    const membership = currentConfirmedMembership(store.membershipEvents);
    expect(membership.get(CLUSTER_A_ID)).not.toContain('it.a4');
    expect(membership.get(CLUSTER_A_ID)!.length).toBe(4);
  });
});

describe('C. recordedAt is the event createdAt (never a member item source time)', () => {
  it('membership + correction envelope.recordedAt === event.createdAt', () => {
    const { backing } = scenarioStore();
    for (const env of backing.readStream(CLUSTER_MEMBERSHIP_EVENTS_STREAM)) {
      const e = env.payload as ClusterMembershipEvent;
      expect(env.recordedAt).toBe(e.createdAt);
    }
  });

  it('dedupe decision envelope.recordedAt === decision.createdAt', () => {
    const { backing } = scenarioStore();
    for (const env of backing.readStream(CLUSTER_DEDUPE_DECISIONS_STREAM)) {
      expect(env.recordedAt).toBe((env.payload as { createdAt: string }).createdAt);
    }
  });

  it('a member item sourceEventTime is NEVER used as the cluster envelope recordedAt', () => {
    const ev: ClusterMembershipEvent = {
      membershipEventId: 'cme-1',
      clusterId: 'ccl-z',
      itemId: 'it.z',
      eventType: 'added',
      reasonType: 'canonical_url_exact',
      reasonDetail: 'x',
      ruleVersion: 'cluster-rule-v1',
      createdAt: '2026-05-31T10:00:00.000Z',
    };
    const input = mapMembershipEventToInput(ev, 0);
    expect(input.recordedAt).toBe('2026-05-31T10:00:00.000Z');
    expect(JSON.stringify(input.payload)).not.toContain('sourceEventTime');
  });

  it('the mapping never samples a clock of its own (no Date.now / argless new Date / Clock)', () => {
    const raw = readFileSync(
      resolve(repoRoot, 'src/domain/clustering/clusterPersistenceMapping.ts'),
      'utf8',
    );
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(code).not.toMatch(/Date\.now\s*\(/);
    expect(code).not.toMatch(/new\s+Date\s*\(\s*\)/);
    expect(code).not.toMatch(/\bMath\.random\b/);
    expect(code).not.toMatch(/randomUUID|\buuid\b/);
    expect(code).not.toMatch(/\bClock\b/);
  });
});

describe('D. deterministic recordId includes the per-stream sequence', () => {
  it('a 12-member same-timestamp batch persists with distinct recordIds, in input order', () => {
    const { backing, store } = newPersistenceStore();
    const engine = new ConfirmedClusterEngine(store, CLOCK);
    engine.addAll(manyMatching(12));
    const recs = backing.readStream(CLUSTER_MEMBERSHIP_EVENTS_STREAM);
    expect(recs.length).toBe(12);
    expect(new Set(recs.map((r) => r.recordId)).size).toBe(12);
    expect(recs.map((r) => r.sequence)).toEqual([...Array(12).keys()]);
    expect(recs.every((r) => r.recordedAt === recs[0].recordedAt)).toBe(true);
  });

  it('many correction events at the same recordedAt persist with distinct recordIds', () => {
    const { backing, store } = newPersistenceStore();
    const engine = new ConfirmedClusterEngine(store, CLOCK);
    const ids = manyMatching(5);
    engine.addAll(ids);
    const clusterId = store.knownClusterIds()[0];
    for (const id of ids) engine.removeMemberAsError(clusterId, id.itemId, 'correction');
    const corrections = backing
      .readStream(CLUSTER_MEMBERSHIP_EVENTS_STREAM)
      .filter((r) => (r.payload as ClusterMembershipEvent).eventType === 'removed_as_error');
    expect(corrections.length).toBe(5);
    expect(new Set(corrections.map((r) => r.recordId)).size).toBe(5);
    expect(corrections.every((r) => r.recordedAt === corrections[0].recordedAt)).toBe(true);
  });

  it('replay from shuffled records reconstructs the same membership order + current count', () => {
    const { backing, store } = newPersistenceStore();
    const engine = new ConfirmedClusterEngine(store, CLOCK);
    engine.addAll(manyMatching(12));
    const directOrder = store.membershipEvents.map((e) => e.itemId);
    const shuffled = orderClusterRecordsGlobally([...backing.readAll()].reverse());
    const replayed = replayClusterHistory(shuffled).membershipEvents.map((e) => e.itemId);
    expect(replayed).toEqual(directOrder);
  });

  it('a TRUE duplicate persisted recordId is still rejected by the underlying store', () => {
    const backing = new InMemoryAppendOnlyPersistenceStore();
    const input = mapMembershipEventToInput(
      {
        membershipEventId: 'cme-1',
        clusterId: 'ccl-z',
        itemId: 'it.z',
        eventType: 'added',
        reasonType: 'canonical_url_exact',
        reasonDetail: 'x',
        ruleVersion: 'cluster-rule-v1',
        createdAt: INSTANT,
      },
      0,
    );
    backing.append(input);
    expect(() => backing.append(input)).toThrow(/duplicate recordId/);
  });
});

describe('E. confirmed vs suggested/semantic separation', () => {
  it('no active clustering source declares a suggested/semantic/fuzzy/embedding cluster type', () => {
    const scanDir = (rel: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(join(repoRoot, rel), { withFileTypes: true })) {
        const relPath = join(rel, entry.name);
        if (entry.isDirectory()) out.push(...scanDir(relPath));
        else if (/\.(ts|tsx)$/.test(entry.name)) out.push(relPath);
      }
      return out;
    };
    const strip = (c: string) =>
      c.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const offenders = scanDir(join('src', 'domain', 'clustering')).filter((f) =>
      /\b(suggestedCluster|semanticCluster|fuzzyCluster|embeddingCluster|llmCluster)\b/.test(
        strip(readFileSync(join(repoRoot, f), 'utf8')),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('confirmedMemberCount only counts confirmed deterministic (added, non-corrected) members', () => {
    const { store, identityById } = scenarioStore();
    const a = confirmedClusters(store, identityById).find((c) => c.clusterId === CLUSTER_A_ID)!;

    expect(a.confirmedMemberCount).toBe(a.confirmedMemberItemIds.length);
    for (const itemId of a.confirmedMemberItemIds) {
      const ev = store
        .eventsForCluster(a.clusterId)
        .find((e) => e.itemId === itemId && e.eventType === 'added')!;
      expect(ev.eventType).toBe('added');

      expect(ev.eventType === 'added' && ev.reasonType).toBeTruthy();
      expect(ev.reasonDetail).toBeTruthy();
    }
  });
});

describe('F. priority equivalence (persistence-backed vs legacy store)', () => {
  const items = FIXTURE_SNAPSHOT.items;
  const buildClusters = (store: ClusterStore): ConfirmedCluster[] => {
    const identities = [...items]
      .sort((a, b) => (a.itemId < b.itemId ? -1 : 1))
      .map(toCanonicalIdentity);
    new ConfirmedClusterEngine(store, CLOCK).addAll(identities);
    return confirmedClusters(store, identityIndex(identities));
  };

  it('confirmedClusters from the persistence-backed store deep-equal the legacy store output', () => {
    const legacy = buildClusters(new AppendOnlyClusterStore());
    const persistence = buildClusters(
      new PersistenceBackedClusterStore(new InMemoryAppendOnlyPersistenceStore()),
    );
    expect(persistence).toEqual(legacy);
  });

  it('per-item confirmed cluster size + priorityReason are identical across stores', () => {
    const legacy = buildClusters(new AppendOnlyClusterStore());
    const persistence = buildClusters(
      new PersistenceBackedClusterStore(new InMemoryAppendOnlyPersistenceStore()),
    );
    const now = new Date(FIXTURE_SNAPSHOT.generatedAt);
    for (const item of items) {
      const lc = confirmedClusterForItem(legacy, item.itemId);
      const pc = confirmedClusterForItem(persistence, item.itemId);
      expect(confirmedClusterSize(pc)).toBe(confirmedClusterSize(lc));
      const source = FIXTURE_SNAPSHOT.sources.find(
        (s: SourceProfile) => s.sourceId === item.sourceId,
      );
      if (!source) continue;
      const lr = computePriorityForClusteredItem({ item, source, now, confirmedCluster: lc });
      const pr = computePriorityForClusteredItem({ item, source, now, confirmedCluster: pc });
      expect(pr.priorityReason).toBe(lr.priorityReason);
      expect(pr.priorityTier).toBe(lr.priorityTier);
    }
  });

  it('a corrected member cannot inflate priority (size is replay-derived current count)', () => {
    const { store, identityById } = scenarioStore();
    const a = confirmedClusters(store, identityById).find((c) => c.clusterId === CLUSTER_A_ID)!;

    expect(confirmedClusterSize(a)).toBe(4);
    expect(a.confirmedMemberItemIds).not.toContain('it.a4');
  });
});

describe('G. Whispers consume replay-derived confirmed cluster data', () => {
  it('ConfirmedClusterDisplay member count = replay-derived confirmed count (corrected excluded)', () => {
    const { store, identityById } = scenarioStore();
    const a = confirmedClusters(store, identityById).find((c) => c.clusterId === CLUSTER_A_ID)!;
    const display = buildConfirmedClusterDisplay(a);

    expect(display?.confirmedMemberCount).toBe(4);
    expect(display?.clusterRuleVersion).toBe('cluster-rule-v1');
  });

  it('annotateItems (runtime persistence-backed path) exposes confirmed counts, not legacy itemCount', () => {
    const now = new Date(FIXTURE_SNAPSHOT.generatedAt);
    const annotated = annotateItems(FIXTURE_SNAPSHOT, now);

    expect(annotated.every((a) => a.confirmedMemberCount >= 1)).toBe(true);
    const clustered = annotated.find((a) => a.confirmedMemberCount >= 2);
    if (clustered) {
      expect(clustered.confirmedCluster?.confirmedMemberCount).toBe(clustered.confirmedMemberCount);
    }
  });
});

describe('H. replay from persisted records reproduces clustering state', () => {
  it('replay(records) reconstructs the same membership + dedupe arrays as direct reads', () => {
    const { backing, store } = scenarioStore();
    const snap = replayClusterHistory(backing.readAll());
    expect(snap.membershipEvents).toEqual(store.membershipEvents);
    expect(snap.dedupeDecisions).toEqual(store.dedupeDecisions);
  });

  it('replay does NOT mutate input records and returns frozen data', () => {
    const { backing } = scenarioStore();
    const records = backing.readAll();
    const before = JSON.stringify(records);
    const snap = replayClusterHistory(records);
    expect(JSON.stringify(records)).toBe(before);
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.membershipEvents)).toBe(true);
    expect(snap.membershipEvents.every((e) => Object.isFrozen(e))).toBe(true);
  });

  it('records from a foreign stream do NOT leak into clustering state', () => {
    const { backing } = scenarioStore();
    const beforeCount = buildClusterSnapshot(backing.readAll()).membershipEvents.length;
    backing.append({
      recordId: 'foreign-0',
      streamName: 'calendar-revisions',
      schemaVersion: 'x',
      producerVersion: 'x',
      sourcePhase: 'phase-2-17-test',
      payload: { revisionId: 'r' },
      recordedAt: INSTANT,
    });
    const snap = buildClusterSnapshot(backing.readAll());
    expect(snap.membershipEvents.length).toBe(beforeCount);
  });

  it('replay REJECTS an unknown stream with a deterministic reason', () => {
    const foreign: PersistedRecord = {
      recordId: 'foreign-0',
      streamName: 'calendar-revisions',
      sequence: 0,
      recordedAt: INSTANT,
      schemaVersion: 'x',
      producerVersion: 'x',
      payloadHash: '0',
      sourcePhase: 'p',
      payload: {},
      contractVersion: 'persistence-contract-v1',
    };
    expect(() => replayClusterHistory([foreign])).toThrow(/unknown stream/);
  });

  it('replay rejects duplicate recordId and non-contiguous per-stream sequence', () => {
    const { backing } = scenarioStore();
    const records = backing.readAll();
    const m = records.find((r) => r.streamName === CLUSTER_MEMBERSHIP_EVENTS_STREAM)!;
    expect(() => replayClusterHistory([m, m])).toThrow(/duplicate recordId/);
    const broken: PersistedRecord = { ...m, recordId: 'm-seq-9-only', sequence: 9 };
    expect(() => buildClusterSnapshot([broken])).toThrow(/non-contiguous sequence/);
  });
});

describe('I. immutability of reads + historical events', () => {
  it('mutating a returned membershipEvents array/payload does not affect later reads', () => {
    const { store } = scenarioStore();
    const events = store.membershipEvents;
    expect(events.every((e) => Object.isFrozen(e))).toBe(true);
    try {
      (events as ClusterMembershipEvent[]).push({ ...events[0], membershipEventId: 'evil' });
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
    }
    expect(store.membershipEvents.some((e) => e.membershipEventId === 'evil')).toBe(false);
  });
});

describe('J. runtime wiring: persistence-backed present, legacy store absent in active runtime', () => {
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
  const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8');
  const stripComments = (code: string): string =>
    code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const readCode = (rel: string) => stripComments(read(rel));
  const activeSrc = scanDir('src');
  const LEGACY_DEF = join('src', 'domain', 'clustering', 'store.ts');

  it('PRESENCE: snapshotClusters + clusterScenario wire the persistence-backed store', () => {
    for (const f of [
      'src/domain/clustering/snapshotClusters.ts',
      'src/fixtures/clustering/clusterScenario.ts',
    ]) {
      const code = read(f);
      expect(code).toMatch(/new PersistenceBackedClusterStore\(/);
      expect(code).toMatch(/InMemoryAppendOnlyPersistenceStore/);
      expect(code).not.toMatch(/new AppendOnlyClusterStore\(/);
    }
  });

  it('ABSENCE: the Clusters page constructs NO store and reads the prepared view', () => {
    const code = read('src/pages/Clusters.tsx');
    expect(code).not.toMatch(/new AppendOnlyClusterStore\(/);
    expect(code).not.toMatch(/new PersistenceBackedClusterStore\(/);
    expect(code).not.toMatch(/buildClusterScenario|ConfirmedClusterEngine/);
    expect(code).toMatch(/CLUSTERS_PAGE_VIEW/);
  });

  it('AppendOnlyClusterStore is referenced in CODE ONLY by its own definition in active non-test src', () => {
    const offenders = activeSrc.filter(
      (f) => f !== LEGACY_DEF && /\bAppendOnlyClusterStore\b/.test(readCode(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('NO page/component imports a writable cluster store, the persistence store, or write APIs', () => {
    const FORBIDDEN =
      /\bAppendOnlyPersistenceStore\b|\bInMemoryAppendOnlyPersistenceStore\b|\bPersistenceBackedClusterStore\b|\bAppendOnlyClusterStore\b|\bConfirmedClusterEngine\b|\bappendMembershipEvent\b/;
    const offenders = [...scanDir('src/pages'), ...scanDir('src/components')].filter((f) =>
      FORBIDDEN.test(readCode(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('the Clusters page renders visible counts from the display contract (no raw fallback)', () => {
    const code = read('src/pages/Clusters.tsx');
    expect(code).not.toMatch(/c\.confirmedMemberCount|c\.sourceCount/);
    expect(code).toMatch(/disp\.confirmedMemberCount/);
    expect(code).toMatch(/disp\.sourceCount/);
  });

  it('the legacy AppendOnlyClusterStore remains available for isolated tests', () => {
    const def = read(LEGACY_DEF);
    expect(def).toMatch(/export class AppendOnlyClusterStore/);
  });
});

describe('K. Clusters page bootstrap lifecycle (per-session, not per-mount)', () => {
  it('the prepared view is frozen + reflects the replay-derived corrected cluster', () => {
    expect(Object.isFrozen(CLUSTERS_PAGE_VIEW)).toBe(true);
    const a = CLUSTERS_PAGE_VIEW.clusters.find((c) => c.clusterId === CLUSTER_A_ID)!;
    expect(a.display?.confirmedMemberCount).toBe(4);
    expect(a.members.map((m) => m.itemId)).not.toContain('it.a4');
    expect(a.corrections.some((c) => c.itemId === 'it.a4')).toBe(true);
  });

  it('mounting the Clusters page twice does not double counts and does not throw', () => {
    const countCards = (c: HTMLElement) =>
      c.querySelectorAll('[data-testid^="cluster-ccl"]').length;
    const first = render(
      <MemoryRouter>
        <Clusters />
      </MemoryRouter>,
    );
    const cardsFirst = countCards(first.container);
    const memberA = first.container
      .querySelector(`[data-testid="cluster-${CLUSTER_A_ID}"]`)!
      .getAttribute('data-member-count');
    first.unmount();

    expect(() =>
      render(
        <MemoryRouter>
          <Clusters />
        </MemoryRouter>,
      ),
    ).not.toThrow();
    const second = screen.getByTestId('clusters-page');
    expect(countCards(second)).toBe(cardsFirst);
    expect(screen.getByTestId(`cluster-${CLUSTER_A_ID}`).getAttribute('data-member-count')).toBe(
      memberA,
    );
  });
});
