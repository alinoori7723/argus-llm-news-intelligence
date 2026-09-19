import { describe, expect, it } from 'vitest';
import {
  ingestedItems,
  ingestibleSources,
  inspectableQuarantineItems,
  promotableItems,
  promotableAnnotatedItems,
  quarantinedSources,
  computePulseCells,
} from '@/domain/selectors';
import { FIXTURE_SNAPSHOT, FIXTURE_NOW } from '@/fixtures/snapshot';

const sourceOf = (itemId: string) => {
  const item = FIXTURE_SNAPSHOT.items.find((i) => i.itemId === itemId)!;
  return FIXTURE_SNAPSHOT.sources.find((s) => s.sourceId === item.sourceId)!;
};

describe('source gating selectors', () => {
  it('ingestibleSources are exactly enabled + allowed sources', () => {
    for (const s of ingestibleSources(FIXTURE_SNAPSHOT)) {
      expect(s.enabled).toBe(true);
      expect(s.legalStatus).toBe('allowed');
    }
  });

  it('quarantinedSources are exactly needs_review or disabled sources', () => {
    for (const s of quarantinedSources(FIXTURE_SNAPSHOT)) {
      expect(['needs_review', 'disabled']).toContain(s.legalStatus);
    }

    const ingestIds = new Set(ingestibleSources(FIXTURE_SNAPSHOT).map((s) => s.sourceId));
    for (const s of quarantinedSources(FIXTURE_SNAPSHOT)) {
      expect(ingestIds.has(s.sourceId)).toBe(false);
    }
  });
});

describe('ingestion quarantine: needs_review never enters the normal snapshot', () => {
  it('ingestedItems excludes needs_review (it.013) and disabled (it.020)', () => {
    const ids = ingestedItems(FIXTURE_SNAPSHOT).map((i) => i.itemId);
    expect(ids).not.toContain('it.013');
    expect(ids).not.toContain('it.020');
  });

  it('every ingested item comes from an enabled + allowed source', () => {
    for (const item of ingestedItems(FIXTURE_SNAPSHOT)) {
      const src = sourceOf(item.itemId);
      expect(src.enabled).toBe(true);
      expect(src.legalStatus).toBe('allowed');
    }
  });

  it('needs_review and disabled items appear only in inspectableQuarantineItems', () => {
    const qIds = inspectableQuarantineItems(FIXTURE_SNAPSHOT).map((i) => i.itemId);
    expect(qIds).toContain('it.013');
    expect(qIds).toContain('it.020');

    const ingestIds = new Set(ingestedItems(FIXTURE_SNAPSHOT).map((i) => i.itemId));
    for (const id of qIds) {
      expect(ingestIds.has(id)).toBe(false);
    }
  });
});

describe('strict promotion gate', () => {
  it('excludes items from disabled sources', () => {
    const ids = promotableItems(FIXTURE_SNAPSHOT).map((i) => i.itemId);
    expect(ids).not.toContain('it.020');
  });

  it('excludes items from needs_review sources even if enabled', () => {
    const ids = promotableItems(FIXTURE_SNAPSHOT).map((i) => i.itemId);
    expect(ids).not.toContain('it.013');
  });

  it('excludes rumor items even from an allowed source', () => {
    expect(sourceOf('it.022').legalStatus).toBe('allowed');
    const ids = promotableItems(FIXTURE_SNAPSHOT).map((i) => i.itemId);
    expect(ids).not.toContain('it.022');
  });

  it('excludes unverified items from promotion (visible in feeds, not high-attention)', () => {
    expect(sourceOf('it.019').legalStatus).toBe('allowed');
    const ids = promotableItems(FIXTURE_SNAPSHOT).map((i) => i.itemId);
    expect(ids).not.toContain('it.019');
  });

  it('every promotable item is allowed-source + has evidence + promotion-tier', () => {
    for (const item of promotableItems(FIXTURE_SNAPSHOT)) {
      const src = sourceOf(item.itemId);
      expect(src.enabled).toBe(true);
      expect(src.legalStatus).toBe('allowed');
      expect(Boolean(item.url) || Boolean(item.sourceItemId)).toBe(true);
      expect(['verified', 'reported', 'scheduled']).toContain(item.verificationTier);
    }
  });

  it('an allowed/promotion-tier item without url or sourceItemId is not promotable', () => {
    const variant = {
      ...FIXTURE_SNAPSHOT,
      items: FIXTURE_SNAPSHOT.items.map((i) =>
        i.itemId === 'it.010' ? { ...i, url: undefined, sourceItemId: '' } : i,
      ),
    };
    const ids = promotableItems(variant).map((i) => i.itemId);
    expect(ids).not.toContain('it.010');
  });

  it('promotableAnnotatedItems never contains needs_review, disabled, rumor, or unverified', () => {
    const annotated = promotableAnnotatedItems(FIXTURE_SNAPSHOT, FIXTURE_NOW);
    for (const a of annotated) {
      expect(a.source.legalStatus).toBe('allowed');
      expect(a.source.enabled).toBe(true);
      expect(['rumor', 'unverified']).not.toContain(a.item.verificationTier);
    }
  });

  it('Pulse cells only reference promotable item ids', () => {
    const promotableIds = new Set(promotableItems(FIXTURE_SNAPSHOT).map((i) => i.itemId));
    const cells = computePulseCells(FIXTURE_SNAPSHOT, FIXTURE_NOW);
    for (const cell of cells) {
      for (const id of cell.matchingItemIds) {
        expect(promotableIds.has(id)).toBe(true);
      }
    }
  });

  it('no needs_review/disabled/rumor/unverified item can contribute to any Pulse cell', () => {
    const cells = computePulseCells(FIXTURE_SNAPSHOT, FIXTURE_NOW);
    const allIds = new Set(cells.flatMap((c) => c.matchingItemIds));
    expect(allIds.has('it.013')).toBe(false);
    expect(allIds.has('it.020')).toBe(false);
    expect(allIds.has('it.022')).toBe(false);
    expect(allIds.has('it.019')).toBe(false);
  });
});
