import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  AppendOnlyClusterStore,
  ConfirmedClusterEngine,
  decideDedupe,
  toCanonicalIdentity,
  type AddedMembershipEvent,
  type CanonicalIdentity,
} from '@/domain/clustering';
import type { ExternalItem } from '@/domain/types';
import { buildClusterScenario } from '@/fixtures/clustering/clusterScenario';

const NOW = new Date('2026-05-31T12:00:00.000Z');
const CLOCK = { now: () => NOW };

const ident = (over: Partial<CanonicalIdentity> & { itemId: string }): CanonicalIdentity => ({
  sourceId: 'src.a',
  dedupeHash: 'h.x',
  assetTags: [],
  topicTags: [],
  observedAt: NOW.toISOString(),
  ruleVersion: 'dedupe-rule-v1',
  ...over,
});

describe('C. membership reason is required by construction', () => {
  it('decideDedupe never returns same without a reasonType', () => {
    const a = ident({ itemId: 'a', dedupeHash: 'h.same' });
    const b = ident({ itemId: 'b', sourceId: 'src.b', dedupeHash: 'h.same' });
    const d = decideDedupe(a, b);
    expect(d.decision).toBe('same');
    if (d.decision === 'same') {
      expect(d.reasonType).toBeTruthy();
      expect(d.reasonDetail).toBeTruthy();
    }
  });

  it('identical itemId uses the closed same_item_id_noop reason (no fuzzy guess)', () => {
    const a = ident({ itemId: 'same', dedupeHash: 'h.one' });
    const d = decideDedupe(a, { ...a });
    expect(d).toMatchObject({ decision: 'same', reasonType: 'same_item_id_noop' });
  });

  it('the engine emits NO added event from an identical-itemId no-op', () => {
    const store = new AppendOnlyClusterStore();
    const engine = new ConfirmedClusterEngine(store, CLOCK);
    const a = ident({ itemId: 'it.dup', dedupeHash: 'h.one' });
    engine.add(a);
    engine.add({ ...a });
    expect(store.membershipEvents.filter((e) => e.eventType === 'added')).toHaveLength(0);
  });

  it('every added membership event in the scenario carries a reasonType', () => {
    const { store } = buildClusterScenario();
    const added = store.membershipEvents.filter((e) => e.eventType === 'added');
    expect(added.length).toBeGreaterThan(0);
    for (const e of added) {
      expect(e.reasonType).toBeTruthy();
      expect(e.reasonDetail).toBeTruthy();
    }
  });

  it('AddedMembershipEvent cannot be constructed without reasonType (type-level)', () => {
    expectTypeOf<
      Omit<AddedMembershipEvent, 'reasonType' | 'reasonDetail'>
    >().not.toMatchTypeOf<AddedMembershipEvent>();
  });

  it('toCanonicalIdentity + engine produce reasoned membership for real items', () => {
    const mk = (id: string): ExternalItem => ({
      itemId: id,
      sourceId: `src.${id}`,
      sourceItemId: `evt-${id}`,
      sourceEventTime: NOW.toISOString(),
      observedAt: NOW.toISOString(),
      ingestedAt: NOW.toISOString(),
      title: 'Same headline',
      excerpt: '',
      url: `https://h/${id}`,
      language: 'en',
      tags: [],
      verificationTier: 'reported',
      freshnessState: 'live',
      dedupeHash: 'h.match',
    });
    const store = new AppendOnlyClusterStore();
    const engine = new ConfirmedClusterEngine(store, CLOCK);
    engine.addAll([mk('it.m1'), mk('it.m2')].map(toCanonicalIdentity));
    const added = store.membershipEvents.filter((e) => e.eventType === 'added');
    expect(added).toHaveLength(2);
    expect(added.every((e) => e.reasonType === 'dedupe_hash_exact')).toBe(true);
  });
});
