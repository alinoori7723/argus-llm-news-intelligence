import { describe, expect, it } from 'vitest';
import {
  DEDUPE_RULE_VERSION,
  canonicalizeUrl,
  decideDedupe,
  normalizeTitle,
  toCanonicalIdentity,
  type CanonicalIdentity,
} from '@/domain/clustering';
import type { ExternalItem } from '@/domain/types';

const id = (over: Partial<CanonicalIdentity>): CanonicalIdentity => ({
  itemId: 'x',
  sourceId: 'src.a',
  dedupeHash: `h.${Math.abs(0)}`,
  assetTags: [],
  topicTags: [],
  observedAt: '2026-05-31T09:00:00.000Z',
  ruleVersion: DEDUPE_RULE_VERSION,
  ...over,
});

describe('3. deterministic dedupe decision', () => {
  it('same source + same sourceItemId ⇒ source_item_id_exact', () => {
    const a = id({ itemId: 'a', sourceId: 's', sourceItemId: 'evt-1', dedupeHash: 'h.a' });
    const b = id({ itemId: 'b', sourceId: 's', sourceItemId: 'evt-1', dedupeHash: 'h.b' });
    expect(decideDedupe(a, b)).toMatchObject({
      decision: 'same',
      reasonType: 'source_item_id_exact',
    });
  });

  it('same canonical URL ⇒ canonical_url_exact', () => {
    const a = id({
      itemId: 'a',
      dedupeHash: 'h.a',
      canonicalUrl: canonicalizeUrl('https://h.example/x?utm_source=tw'),
    });
    const b = id({
      itemId: 'b',
      sourceId: 'src.b',
      dedupeHash: 'h.b',
      canonicalUrl: canonicalizeUrl('https://h.example/x#frag'),
    });
    expect(decideDedupe(a, b)).toMatchObject({
      decision: 'same',
      reasonType: 'canonical_url_exact',
    });
  });

  it('same dedupeHash ⇒ dedupe_hash_exact', () => {
    const a = id({ itemId: 'a', dedupeHash: 'h.same' });
    const b = id({ itemId: 'b', sourceId: 'src.b', dedupeHash: 'h.same' });
    expect(decideDedupe(a, b)).toMatchObject({
      decision: 'same',
      reasonType: 'dedupe_hash_exact',
    });
  });

  it('strict normalized title only matches when explicitly enabled', () => {
    const common = {
      normalizedTitle: normalizeTitle('Fed holds rates'),
      assetTags: ['DXY'],
      topicTags: ['central-bank'],
    };
    const a = id({ itemId: 'a', sourceId: 's1', dedupeHash: 'h.a', ...common });
    const b = id({ itemId: 'b', sourceId: 's2', dedupeHash: 'h.b', ...common });

    expect(decideDedupe(a, b).decision).toBe('different');

    expect(decideDedupe(a, b, { allowStrictTitle: true })).toMatchObject({
      decision: 'same',
      reasonType: 'normalized_title_exact_strict',
    });
  });

  it('toCanonicalIdentity computes canonicalUrl and ignores llm_suggested tags', () => {
    const item: ExternalItem = {
      itemId: 'it.x',
      sourceId: 'src.a',
      sourceItemId: 'evt-x',
      sourceEventTime: '2026-05-31T08:00:00.000Z',
      observedAt: '2026-05-31T09:00:00.000Z',
      ingestedAt: '2026-05-31T09:00:00.000Z',
      title: '  Fed Holds Rates ',
      excerpt: '',
      url: 'https://H.Example/fed?utm_source=tw',
      language: 'en',
      tags: [
        { tagId: 't1', tagType: 'asset', tagValue: 'DXY', provenance: 'deterministic' },
        { tagId: 't2', tagType: 'topic', tagValue: 'central-bank', provenance: 'llm_suggested' },
      ],
      verificationTier: 'reported',
      freshnessState: 'live',
      dedupeHash: 'h.x',
    };
    const ci = toCanonicalIdentity(item);
    expect(ci.canonicalUrl).toBe('https://h.example/fed');
    expect(ci.normalizedTitle).toBe('fed holds rates');
    expect(ci.assetTags).toEqual(['DXY']);
    expect(ci.topicTags).toEqual([]);
  });
});

describe('4. over-merge prevention (when uncertain, do not merge)', () => {
  const base = {
    assetTags: ['DXY'],
    topicTags: ['central-bank'],
    normalizedTitle: normalizeTitle('Fed holds rates'),
  };

  it('different paths do not merge', () => {
    const a = id({ itemId: 'a', dedupeHash: 'h.a', canonicalUrl: canonicalizeUrl('https://h/x') });
    const b = id({ itemId: 'b', dedupeHash: 'h.b', canonicalUrl: canonicalizeUrl('https://h/y') });
    expect(decideDedupe(a, b).decision).toBe('different');
  });

  it('AMP vs non-AMP do not merge', () => {
    const a = id({
      itemId: 'a',
      dedupeHash: 'h.a',
      canonicalUrl: canonicalizeUrl('https://h/x-amp'),
    });
    const b = id({ itemId: 'b', dedupeHash: 'h.b', canonicalUrl: canonicalizeUrl('https://h/x') });
    expect(decideDedupe(a, b).decision).toBe('different');
  });

  it('same sourceItemId but DIFFERENT source does not merge', () => {
    const a = id({ itemId: 'a', sourceId: 's1', sourceItemId: 'evt-1', dedupeHash: 'h.a' });
    const b = id({ itemId: 'b', sourceId: 's2', sourceItemId: 'evt-1', dedupeHash: 'h.b' });
    expect(decideDedupe(a, b).decision).toBe('different');
  });

  it('identical title+tags do not merge by default (strict-title off)', () => {
    const a = id({ itemId: 'a', sourceId: 's1', dedupeHash: 'h.a', ...base });
    const b = id({ itemId: 'b', sourceId: 's2', dedupeHash: 'h.b', ...base });
    expect(decideDedupe(a, b).decision).toBe('different');
  });

  it('even with strict-title ON: different tags do not merge', () => {
    const a = id({ itemId: 'a', sourceId: 's1', dedupeHash: 'h.a', ...base });
    const b = id({ itemId: 'b', sourceId: 's2', dedupeHash: 'h.b', ...base, assetTags: ['SPX'] });
    expect(decideDedupe(a, b, { allowStrictTitle: true }).decision).toBe('different');
  });

  it('even with strict-title ON: outside the time window does not merge', () => {
    const a = id({
      itemId: 'a',
      sourceId: 's1',
      dedupeHash: 'h.a',
      ...base,
      observedAt: '2026-05-31T00:00:00.000Z',
    });
    const b = id({
      itemId: 'b',
      sourceId: 's2',
      dedupeHash: 'h.b',
      ...base,
      observedAt: '2026-05-31T23:00:00.000Z',
    });
    expect(decideDedupe(a, b, { allowStrictTitle: true }).decision).toBe('different');
  });
});
