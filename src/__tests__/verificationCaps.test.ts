import { describe, expect, it } from 'vitest';
import { computePriority } from '@/domain/priority';
import { FIXTURE_SNAPSHOT, FIXTURE_NOW } from '@/fixtures/snapshot';
import type { ExternalItem, SourceProfile } from '@/domain/types';

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

const TIER_ORDER = ['P0', 'P1', 'P2', 'P3', 'muted'];

describe('verification-tier caps (item-level, allowed sources)', () => {
  it('rumor from an allowed source cannot become P0/P1/P2 even with every boost', () => {
    const boostedRumor: ExternalItem = {
      ...findItem('it.022'),
      verificationTier: 'rumor',
      observedAt: FIXTURE_NOW.toISOString(),
      tags: [
        {
          tagId: 't.macro.fomc.boost',
          tagType: 'macro',
          tagValue: 'FOMC',
          provenance: 'deterministic',
        },
      ],
    };
    const primary = findSource('src.wire.fixture.a');
    const r = computePriority({
      item: boostedRumor,
      source: primary,
      confirmedClusterSize: 10,
      now: FIXTURE_NOW,
    });
    expect(['P3', 'muted']).toContain(r.priorityTier);
    expect(['P0', 'P1', 'P2']).not.toContain(r.priorityTier);
  });

  it('rumor from an allowed source has urgency background/muted (never now/soon/today)', () => {
    const boostedRumor: ExternalItem = {
      ...findItem('it.022'),
      verificationTier: 'rumor',
      observedAt: FIXTURE_NOW.toISOString(),
    };
    const r = computePriority({
      item: boostedRumor,
      source: findSource('src.wire.fixture.a'),
      confirmedClusterSize: 10,
      now: FIXTURE_NOW,
    });
    expect(['background', 'muted']).toContain(r.urgencyLabel);
    expect(['now', 'soon', 'today']).not.toContain(r.urgencyLabel);
  });

  it('a scheduled-tagged rumor cannot re-escalate urgency to soon/now', () => {
    const scheduledRumor: ExternalItem = {
      ...findItem('it.022'),
      verificationTier: 'rumor',
      tags: [
        {
          tagId: 't.macro.cpi.fake',
          tagType: 'macro',
          tagValue: 'CPI',
          provenance: 'deterministic',
        },
      ],
    };
    const r = computePriority({
      item: scheduledRumor,
      source: findSource('src.wire.fixture.a'),
      confirmedClusterSize: 1,
      now: FIXTURE_NOW,
    });
    expect(r.urgencyLabel).not.toBe('now');
    expect(r.urgencyLabel).not.toBe('soon');
  });

  it('unverified from an allowed source cannot become P0/P1', () => {
    const boostedUnverified: ExternalItem = {
      ...findItem('it.019'),
      verificationTier: 'unverified',
      observedAt: FIXTURE_NOW.toISOString(),
      tags: [
        {
          tagId: 't.macro.fomc.unv',
          tagType: 'macro',
          tagValue: 'FOMC',
          provenance: 'deterministic',
        },
      ],
    };
    const r = computePriority({
      item: boostedUnverified,
      source: findSource('src.wire.fixture.a'),
      confirmedClusterSize: 10,
      now: FIXTURE_NOW,
    });
    expect(['P0', 'P1']).not.toContain(r.priorityTier);
    expect(r.urgencyLabel).not.toBe('now');
  });

  it('unverified is capped strictly below verified/reported from the same source', () => {
    const base = findItem('it.019');
    const source = findSource('src.wire.fixture.a');
    const tierIndex = (tier: ExternalItem['verificationTier']) =>
      TIER_ORDER.indexOf(
        computePriority({
          item: { ...base, verificationTier: tier },
          source,
          confirmedClusterSize: 3,
          now: FIXTURE_NOW,
        }).priorityTier,
      );
    const unverified = tierIndex('unverified');
    expect(unverified).toBeGreaterThan(tierIndex('reported'));
    expect(unverified).toBeGreaterThan(tierIndex('verified'));
  });

  it('verified / reported / scheduled retain deterministic (uncapped) ranking', () => {
    const base = findItem('it.019');
    const source = findSource('src.wire.fixture.a');

    const verified: ExternalItem = {
      ...base,
      verificationTier: 'verified',
      observedAt: FIXTURE_NOW.toISOString(),
      tags: [
        {
          tagId: 't.macro.fomc.v',
          tagType: 'macro',
          tagValue: 'FOMC',
          provenance: 'deterministic',
        },
      ],
    };
    const r = computePriority({
      item: verified,
      source,
      confirmedClusterSize: 10,
      now: FIXTURE_NOW,
    });
    expect(['P0', 'P1']).toContain(r.priorityTier);
    expect(r.priorityReason).not.toMatch(/cap/);
  });
});
