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

describe('needs_review urgency cap', () => {
  const needsReviewSource = findSource('src.social.placeholder');
  expect(needsReviewSource.legalStatus).toBe('needs_review');

  it('caps priority at P3 for needs_review items', () => {
    const item = findItem('it.013');
    const r = computePriority({
      item,
      source: needsReviewSource,
      confirmedClusterSize: 10,
      now: FIXTURE_NOW,
    });
    expect(['P3', 'muted']).toContain(r.priorityTier);
    expect(['P0', 'P1', 'P2']).not.toContain(r.priorityTier);
  });

  it('caps urgency to background/muted for needs_review items', () => {
    const item = findItem('it.013');
    const r = computePriority({
      item,
      source: needsReviewSource,
      confirmedClusterSize: 10,
      now: FIXTURE_NOW,
    });
    expect(['background', 'muted']).toContain(r.urgencyLabel);
    expect(['now', 'soon', 'today']).not.toContain(r.urgencyLabel);
  });

  it('scheduled item on needs_review source cannot escalate to "soon" or "now"', () => {
    const macroScheduled: ExternalItem = {
      ...findItem('it.001'),
      itemId: 'synthetic-needs-review-scheduled',
      sourceId: needsReviewSource.sourceId,
      verificationTier: 'scheduled',
      tags: [
        {
          tagId: 't.macro.fomc.fake',
          tagType: 'macro',
          tagValue: 'FOMC',
          provenance: 'deterministic',
        },
      ],
    };
    const r = computePriority({
      item: macroScheduled,
      source: needsReviewSource,
      confirmedClusterSize: 1,
      now: FIXTURE_NOW,
    });
    expect(['background', 'muted']).toContain(r.urgencyLabel);
    expect(r.urgencyLabel).not.toBe('soon');
    expect(r.urgencyLabel).not.toBe('now');
  });

  it('allowed-source scheduled item still gets urgency "soon" (cap is needs_review-specific)', () => {
    const item = findItem('it.001');
    const src = findSource(item.sourceId);
    expect(src.legalStatus).toBe('allowed');
    const r = computePriority({
      item,
      source: src,
      confirmedClusterSize: 3,
      now: FIXTURE_NOW,
    });
    expect(r.urgencyLabel).toBe('soon');
  });
});
