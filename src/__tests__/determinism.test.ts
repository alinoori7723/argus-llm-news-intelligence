import { describe, expect, it } from 'vitest';
import { computePriority, recomputeClusterPriority } from '@/domain/priority';
import { FIXTURE_SNAPSHOT, FIXTURE_NOW } from '@/fixtures/snapshot';

describe('priority/urgency helpers require deterministic `now`', () => {
  const item = FIXTURE_SNAPSHOT.items.find((i) => i.itemId === 'it.002')!;
  const source = FIXTURE_SNAPSHOT.sources.find((s) => s.sourceId === item.sourceId)!;
  const cluster = FIXTURE_SNAPSHOT.clusters[0];

  it('computePriority throws when `now` is omitted', () => {
    expect(() =>
      computePriority({
        item,
        source,
        confirmedClusterSize: 1,
        now: undefined as unknown as Date,
      }),
    ).toThrow(/deterministic.*now/i);
  });

  it('computePriority throws when `now` is an invalid Date', () => {
    expect(() =>
      computePriority({
        item,
        source,
        confirmedClusterSize: 1,
        now: new Date('not-a-date'),
      }),
    ).toThrow(/deterministic.*now/i);
  });

  it('recomputeClusterPriority throws when `now` is omitted', () => {
    expect(() =>
      recomputeClusterPriority(cluster, FIXTURE_SNAPSHOT, undefined as unknown as Date),
    ).toThrow(/deterministic.*now/i);
  });

  it('explicit fixture-time `now` is accepted and stable', () => {
    const a = computePriority({
      item,
      source,
      confirmedClusterSize: 1,
      now: FIXTURE_NOW,
    });
    const b = computePriority({
      item,
      source,
      confirmedClusterSize: 1,
      now: FIXTURE_NOW,
    });
    expect(a).toEqual(b);
  });
});
