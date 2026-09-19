import { describe, expect, it } from 'vitest';
import { fixedClock } from '@/domain/ingestion';
import {
  computePriorityForClusteredItem,
  confirmedClusters,
  confirmedClusterSize,
  confirmedClusterSizeForItem,
  type ConfirmedCluster,
} from '@/domain/clustering';
import { buildClusterScenario } from '@/fixtures/clustering/clusterScenario';
import type { ExternalItem, SourceProfile } from '@/domain/types';

const NOW = fixedClock('2026-05-31T09:30:00.000Z').now();
const TIER_ORDER = ['P0', 'P1', 'P2', 'P3', 'muted'];

const source: SourceProfile = {
  sourceId: 'src.wire.a',
  name: 'Wire A',
  sourceType: 'rss_fixture',
  accessMethod: 'recorded',
  legalStatus: 'allowed',
  enabled: true,
  sourceTier: 'reputable',
  trustNotes: '',
  freshnessExpectation: '',
  defaultAssetTags: [],
  defaultTopicTags: [],
};

const item: ExternalItem = {
  itemId: 'it.a1',
  sourceId: 'src.wire.a',
  sourceItemId: 'wireA-fed-1',
  sourceEventTime: '2026-05-31T09:00:00.000Z',
  observedAt: '2026-05-31T09:20:00.000Z',
  ingestedAt: '2026-05-31T09:20:00.000Z',
  title: 'Fed Holds Rates',
  excerpt: '',
  url: 'https://news.example/fed-holds-rates',
  language: 'en',
  tags: [{ tagId: 't1', tagType: 'asset', tagValue: 'DXY', provenance: 'deterministic' }],
  verificationTier: 'reported',
  freshnessState: 'live',
  dedupeHash: 'h.fed.holds.canonical',
};

const cluster = (): ConfirmedCluster => {
  const { store, identityById } = buildClusterScenario();
  return confirmedClusters(store, identityById)[0];
};

describe('9. priority integration (confirmed clusters only)', () => {
  it('confirmed cluster size influences priority and is reflected in the reason', () => {
    const c = cluster();
    const withCluster = computePriorityForClusteredItem({
      item,
      source,
      now: NOW,
      confirmedCluster: c,
    });
    const withoutCluster = computePriorityForClusteredItem({ item, source, now: NOW });

    expect(withCluster.priorityReason).toMatch(
      /confirmed cluster ccl-it\.a1 size 4 \(cluster-rule-v1\)/,
    );
    expect(withoutCluster.priorityReason).not.toMatch(/confirmed cluster/);

    expect(TIER_ORDER.indexOf(withCluster.priorityTier)).toBeLessThanOrEqual(
      TIER_ORDER.indexOf(withoutCluster.priorityTier),
    );
  });

  it('confirmedClusterSize uses confirmedMemberCount for a real cluster', () => {
    expect(confirmedClusterSize(cluster())).toBe(4);
  });

  it('a non-confirmed / wrong-rule-version cluster shape cannot inflate size', () => {
    const fake = { ...cluster(), clusterRuleVersion: 'semantic-vibes-v9' } as ConfirmedCluster;
    expect(confirmedClusterSize(fake)).toBe(1);
    const archived = { ...cluster(), clusterStatus: 'archived' } as ConfirmedCluster;
    expect(confirmedClusterSize(archived)).toBe(1);
    expect(confirmedClusterSize(undefined)).toBe(1);

    const res = computePriorityForClusteredItem({ item, source, now: NOW, confirmedCluster: fake });
    expect(res.priorityReason).not.toMatch(/confirmed cluster/);
  });

  it('confirmedClusterSizeForItem returns 1 for unclustered items', () => {
    const { store, identityById } = buildClusterScenario();
    const clusters = confirmedClusters(store, identityById);
    expect(confirmedClusterSizeForItem(clusters, 'it.a1')).toBe(4);
    expect(confirmedClusterSizeForItem(clusters, 'it.n1')).toBe(1);
  });
});
