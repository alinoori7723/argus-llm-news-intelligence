import { describe, expect, it } from 'vitest';
import { computePriority, filterDeterministicTags } from '@/domain/priority';
import { annotateItems, computePulseCells } from '@/domain/selectors';
import { buildConfirmedClustersFromItems, confirmedClusterSizeForItem } from '@/domain/clustering';
import { FIXTURE_SNAPSHOT, FIXTURE_NOW } from '@/fixtures/snapshot';
import type { ExternalItem, SourceProfile, Tag } from '@/domain/types';

const findItem = (id: string): ExternalItem => {
  const it = FIXTURE_SNAPSHOT.items.find((i) => i.itemId === id);
  if (!it) throw new Error(`fixture item ${id} missing`);
  return it;
};

const findSource = (id: string): SourceProfile => {
  const s = FIXTURE_SNAPSHOT.sources.find((s) => s.sourceId === id);
  if (!s) throw new Error(`fixture source ${id} missing`);
  return s;
};

describe('1. deterministic priority calculation', () => {
  it('is stable for identical inputs', () => {
    const item = findItem('it.002');
    const source = findSource(item.sourceId);
    const a = computePriority({ item, source, confirmedClusterSize: 3, now: FIXTURE_NOW });
    const b = computePriority({ item, source, confirmedClusterSize: 3, now: FIXTURE_NOW });
    expect(a).toEqual(b);
  });

  it('emits a reason string referencing each contributing input', () => {
    const item = findItem('it.001');
    const source = findSource(item.sourceId);
    const r = computePriority({ item, source, confirmedClusterSize: 3, now: FIXTURE_NOW });
    expect(r.priorityReason).toMatch(/source tier/);
    expect(r.priorityReason).toMatch(/verification/);
    expect(r.priorityReason).toMatch(/cluster size/);
  });
});

describe('2. verification tier behavior', () => {
  it('rumor items rank below reported items from the same source', () => {
    const rumorItem = findItem('it.013');
    const rumorSource = findSource(rumorItem.sourceId);

    const adjusted: SourceProfile = { ...rumorSource, legalStatus: 'allowed', enabled: true };
    const rumorScore = computePriority({
      item: rumorItem,
      source: adjusted,
      confirmedClusterSize: 1,
      now: FIXTURE_NOW,
    });
    const reportedScore = computePriority({
      item: { ...rumorItem, verificationTier: 'reported' },
      source: adjusted,
      confirmedClusterSize: 1,
      now: FIXTURE_NOW,
    });
    const order = ['P0', 'P1', 'P2', 'P3', 'muted'];
    expect(order.indexOf(rumorScore.priorityTier)).toBeGreaterThanOrEqual(
      order.indexOf(reportedScore.priorityTier),
    );
  });

  it('scheduled verification yields urgency soon', () => {
    const it = findItem('it.001');
    const src = findSource(it.sourceId);
    const r = computePriority({ item: it, source: src, confirmedClusterSize: 3, now: FIXTURE_NOW });
    expect(r.urgencyLabel).toBe('soon');
  });
});

describe('3. disabled / needs_review sources are not promoted', () => {
  it('items from disabled sources are muted', () => {
    const item = findItem('it.020');
    const source = findSource(item.sourceId);
    const r = computePriority({ item, source, confirmedClusterSize: 5, now: FIXTURE_NOW });
    expect(r.priorityTier).toBe('muted');
    expect(r.urgencyLabel).toBe('muted');
  });

  it('items from needs_review sources are capped at P3', () => {
    const item = findItem('it.013');
    const source = findSource(item.sourceId);
    const r = computePriority({ item, source, confirmedClusterSize: 10, now: FIXTURE_NOW });
    const order = ['P0', 'P1', 'P2', 'P3', 'muted'];
    expect(order.indexOf(r.priorityTier)).toBeGreaterThanOrEqual(order.indexOf('P3'));
  });

  it('annotateItems excludes disabled-source items entirely', () => {
    const annotated = annotateItems(FIXTURE_SNAPSHOT, FIXTURE_NOW);
    expect(annotated.find((a) => a.item.itemId === 'it.020')).toBeUndefined();
  });
});

describe('8. cluster-size influence (confirmed deterministic clusters only)', () => {
  const clusterView = buildConfirmedClustersFromItems(FIXTURE_SNAPSHOT.items, {
    now: () => FIXTURE_NOW,
  });

  it('counts confirmed membership via exact dedupeHash match', () => {
    expect(confirmedClusterSizeForItem(clusterView.clusters, 'it.002')).toBeGreaterThanOrEqual(2);
  });

  it('ignores semantic similarity — a unique-identity item stays size 1', () => {
    const isolated = findItem('it.015');
    expect(confirmedClusterSizeForItem(clusterView.clusters, isolated.itemId)).toBe(1);
  });
});

describe('9. llm_suggested tags do not affect priority or urgency', () => {
  it('priority helper filters out llm_suggested tags', () => {
    const tags: Tag[] = [
      { tagId: 'a', tagType: 'macro', tagValue: 'Powell', provenance: 'deterministic' },
      { tagId: 'b', tagType: 'macro', tagValue: 'FOMC', provenance: 'llm_suggested' },
      { tagId: 'c', tagType: 'asset', tagValue: 'Gold', provenance: 'user_confirmed' },
    ];
    const usable = filterDeterministicTags(tags);
    expect(usable.map((t) => t.tagId).sort()).toEqual(['a', 'c']);
  });

  it('adding an llm_suggested macro tag does not change priority or urgency', () => {
    const baseItem = findItem('it.018');
    const source = findSource(baseItem.sourceId);
    const withoutLlm: ExternalItem = {
      ...baseItem,
      tags: baseItem.tags.filter((t) => t.provenance !== 'llm_suggested'),
    };
    const baseResult = computePriority({
      item: withoutLlm,
      source,
      confirmedClusterSize: 1,
      now: FIXTURE_NOW,
    });
    const withLlm = computePriority({
      item: baseItem,
      source,
      confirmedClusterSize: 1,
      now: FIXTURE_NOW,
    });
    expect(withLlm.priorityTier).toBe(baseResult.priorityTier);
    expect(withLlm.urgencyLabel).toBe(baseResult.urgencyLabel);
  });
});

describe('4. Pulse cells use only source-backed items/clusters', () => {
  it('every matching itemId points at an item from an enabled source', () => {
    const cells = computePulseCells(FIXTURE_SNAPSHOT, FIXTURE_NOW);
    for (const cell of cells) {
      for (const id of cell.matchingItemIds) {
        const item = FIXTURE_SNAPSHOT.items.find((i) => i.itemId === id);
        expect(item).toBeDefined();
        const src = FIXTURE_SNAPSHOT.sources.find((s) => s.sourceId === item!.sourceId);
        expect(src?.enabled).toBe(true);
        expect(src?.legalStatus).not.toBe('disabled');
      }
    }
  });

  it('summary lines never embed market-state inference', () => {
    const cells = computePulseCells(FIXTURE_SNAPSHOT, FIXTURE_NOW);
    const forbidden =
      /\b(gold is calm|dxy is bid|s&p is weak|risk appetite fading|under pressure|bearish|bullish|market is waiting|dollar pressure rising)\b/i;
    for (const cell of cells) {
      expect(cell.summary).not.toMatch(forbidden);
    }
  });
});
