import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { annotateItems, computePulseCells } from '@/domain/selectors';
import {
  AppendOnlyClusterStore,
  ConfirmedClusterEngine,
  computePriorityForClusteredItem,
  confirmedClusters,
  identityIndex,
  toCanonicalIdentity,
} from '@/domain/clustering';
import type { ExternalItem, FixtureSnapshot, SourceProfile } from '@/domain/types';

const NOW = new Date('2026-05-31T12:00:00.000Z');
const CLOCK = { now: () => NOW };

const src = (over: Partial<SourceProfile> = {}): SourceProfile => ({
  sourceId: 'src.a',
  name: 'Source A',
  sourceType: 'rss_fixture',
  accessMethod: 'recorded',
  legalStatus: 'allowed',
  enabled: true,
  sourceTier: 'reputable',
  trustNotes: '',
  freshnessExpectation: '',
  defaultAssetTags: [],
  defaultTopicTags: [],
  ...over,
});

const item = (over: Partial<ExternalItem>): ExternalItem => ({
  itemId: 'it.x',
  sourceId: 'src.a',
  sourceItemId: 'evt-x',
  sourceEventTime: '2026-05-31T11:00:00.000Z',
  observedAt: '2026-05-31T11:50:00.000Z',
  ingestedAt: '2026-05-31T11:50:00.000Z',
  title: 'Headline',
  excerpt: '',
  url: 'https://h.example/x',
  language: 'en',
  tags: [{ tagId: 't', tagType: 'asset', tagValue: 'DXY', provenance: 'deterministic' }],
  verificationTier: 'reported',
  freshnessState: 'live',
  dedupeHash: 'h.unique',
  ...over,
});

const snapshot = (
  items: ExternalItem[],
  sources: SourceProfile[],
  clusters: FixtureSnapshot['clusters'] = [],
): FixtureSnapshot => ({
  generatedAt: NOW.toISOString(),
  sources,
  items,
  clusters,
});

describe('D1. annotateItems uses confirmed cluster membership', () => {
  it('reflects confirmedMemberCount + CLUSTER_RULE_VERSION in the reason', () => {
    const snap = snapshot(
      [
        item({ itemId: 'it.p1', sourceId: 'src.a', dedupeHash: 'h.shared', url: 'https://h/1' }),
        item({ itemId: 'it.p2', sourceId: 'src.b', dedupeHash: 'h.shared', url: 'https://h/2' }),
      ],
      [src({ sourceId: 'src.a' }), src({ sourceId: 'src.b' })],
    );
    const annotated = annotateItems(snap, NOW);
    const a = annotated.find((x) => x.item.itemId === 'it.p1')!;
    expect(a.confirmedMemberCount).toBe(2);
    expect(a.confirmedClusterId).toBe('ccl-it.p1');
    expect(a.priority.priorityReason).toMatch(
      /confirmed cluster ccl-it\.p1 size 2 \(cluster-rule-v1\)/,
    );
  });
});

describe('D2. annotateItems ignores legacy snapshot.clusters.itemCount', () => {
  it('an inflated legacy cluster does not raise priority', () => {
    const it1 = item({ itemId: 'it.s1', dedupeHash: 'h.solo', clusterId: 'cl.legacy' });
    const legacyCluster = {
      clusterId: 'cl.legacy',
      title: 'Legacy',
      firstObservedAt: NOW.toISOString(),
      lastObservedAt: NOW.toISOString(),
      itemIds: ['it.s1'],
      sourceCount: 99,
      itemCount: 99,
      highestSourceTier: 'primary' as const,
      verificationTier: 'reported' as const,
      priorityTier: 'P0' as const,
      urgencyLabel: 'now' as const,
      priorityReason: 'legacy',
      tags: [],
    };
    const snap = snapshot([it1], [src()], [legacyCluster]);
    const a = annotateItems(snap, NOW).find((x) => x.item.itemId === 'it.s1')!;
    expect(a.confirmedMemberCount).toBe(1);
    expect(a.priority.priorityReason).not.toMatch(/confirmed cluster/);
    expect(a.priority.priorityReason).not.toMatch(/size 99/);
  });
});

describe('D3. raw dedupeHash matches across non-ingested sources do not inflate', () => {
  it('a disabled-source item with the same dedupeHash is not counted', () => {
    const allowed = item({ itemId: 'it.a1', sourceId: 'src.a', dedupeHash: 'h.dup' });
    const disabledItem = item({ itemId: 'it.d1', sourceId: 'src.dead', dedupeHash: 'h.dup' });
    const snap = snapshot(
      [allowed, disabledItem],
      [
        src({ sourceId: 'src.a' }),
        src({ sourceId: 'src.dead', legalStatus: 'disabled', enabled: false }),
      ],
    );
    const annotated = annotateItems(snap, NOW);

    expect(annotated.find((x) => x.item.itemId === 'it.d1')).toBeUndefined();
    const a = annotated.find((x) => x.item.itemId === 'it.a1')!;

    expect(a.confirmedMemberCount).toBe(1);
    expect(a.priority.priorityReason).not.toMatch(/confirmed cluster/);
  });
});

describe('D4. correction reduces the derived count used by priority', () => {
  it('priority uses the current (post-correction) count, not the historical added count', () => {
    const ids = ['it.c1', 'it.c2', 'it.c3'].map((id) =>
      toCanonicalIdentity(item({ itemId: id, sourceId: `src.${id}`, dedupeHash: 'h.cluster3' })),
    );
    const store = new AppendOnlyClusterStore();
    const engine = new ConfirmedClusterEngine(store, CLOCK);
    engine.addAll(ids);
    let cluster = confirmedClusters(store, identityIndex(ids))[0];
    expect(cluster.confirmedMemberCount).toBe(3);

    engine.removeMemberAsError(cluster.clusterId, 'it.c3', 'mistaken member');
    cluster = confirmedClusters(store, identityIndex(ids))[0];
    expect(cluster.confirmedMemberCount).toBe(2);

    const res = computePriorityForClusteredItem({
      item: item({ itemId: 'it.c1', dedupeHash: 'h.cluster3' }),
      source: src(),
      now: NOW,
      confirmedCluster: cluster,
    });
    expect(res.priorityReason).toMatch(/size 2 \(cluster-rule-v1\)/);
    expect(res.priorityReason).not.toMatch(/size 3/);
  });
});

describe('D5. promoted selection is not inflated by unconfirmed cluster sizing', () => {
  it('Pulse membership is independent of legacy cluster itemCount', () => {
    const items = [
      item({
        itemId: 'it.g1',
        dedupeHash: 'h.g1',
        tags: [{ tagId: 't', tagType: 'asset', tagValue: 'Gold', provenance: 'deterministic' }],
      }),
    ];
    const a = computePulseCells(snapshot(items, [src()], []), NOW);
    const b = computePulseCells(
      snapshot(
        items,
        [src()],
        [
          {
            clusterId: 'cl.x',
            title: 't',
            firstObservedAt: NOW.toISOString(),
            lastObservedAt: NOW.toISOString(),
            itemIds: ['it.g1'],
            sourceCount: 1,
            itemCount: 50,
            highestSourceTier: 'primary',
            verificationTier: 'reported',
            priorityTier: 'P0',
            urgencyLabel: 'now',
            priorityReason: '',
            tags: [],
          },
        ],
      ),
      NOW,
    );
    const ids = (cells: typeof a) => cells.flatMap((c) => c.matchingItemIds).sort();
    expect(ids(a)).toEqual(ids(b));
  });
});

describe('D6. runtime wiring is present in active domain code (static evidence)', () => {
  const read = (rel: string) =>
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', rel), 'utf8');

  it('annotateItems wires the confirmed-cluster priority helper', () => {
    const selectors = read('domain/selectors.ts');
    expect(selectors).toMatch(/computePriorityForClusteredItem/);
    expect(selectors).toMatch(/buildConfirmedClustersFromItems/);
    expect(selectors).not.toMatch(/deterministicClusterSizeFor/);
  });

  it('the legacy deterministicClusterSizeFor helper no longer exists', () => {
    const priority = read('domain/priority.ts');
    expect(priority).not.toMatch(/deterministicClusterSizeFor/);
  });
});
