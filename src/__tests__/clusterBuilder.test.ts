import { describe, expect, it } from 'vitest';
import {
  confirmedClusters,
  confirmedClusterForItem,
  correctionEventsFor,
  membershipReasonFor,
} from '@/domain/clustering';
import { CLUSTER_A_ID, buildClusterScenario } from '@/fixtures/clustering/clusterScenario';

describe('5. cluster builder (confirmed deterministic membership)', () => {
  const { store, identityById } = buildClusterScenario();
  const clusters = confirmedClusters(store, identityById);

  it('builds exactly one confirmed cluster from exact matches', () => {
    expect(clusters).toHaveLength(1);
    expect(clusters[0].clusterId).toBe(CLUSTER_A_ID);
  });

  it('cluster members are the confirmed exact-match items only', () => {
    expect(clusters[0].confirmedMemberItemIds).toEqual(['it.a1', 'it.a2', 'it.a3', 'it.a5']);
  });

  it('every member carries a deterministic inclusion reason', () => {
    for (const itemId of clusters[0].confirmedMemberItemIds) {
      const reason = membershipReasonFor(store, CLUSTER_A_ID, itemId);
      expect(reason).toBeDefined();
      expect(reason!.reasonType).toBeTruthy();
      expect(reason!.ruleVersion).toBe('cluster-rule-v1');
    }

    expect(membershipReasonFor(store, CLUSTER_A_ID, 'it.a3')!.reasonType).toBe('dedupe_hash_exact');
    expect(membershipReasonFor(store, CLUSTER_A_ID, 'it.a2')!.reasonType).toBe(
      'canonical_url_exact',
    );
  });

  it('cluster title derives from the earliest confirmed member', () => {
    expect(clusters[0].clusterTitle).toBe('fed holds rates');
  });

  it('similar-but-different items are NOT clustered (under-merge)', () => {
    expect(confirmedClusterForItem(clusters, 'it.n1')).toBeUndefined();
    expect(confirmedClusterForItem(clusters, 'it.n2')).toBeUndefined();
    expect(store.currentClusterIdForItem('it.n1')).toBeUndefined();
    expect(store.currentClusterIdForItem('it.n2')).toBeUndefined();
  });
});

describe('6. append-only membership events', () => {
  const { store } = buildClusterScenario();

  it('records an added event per member plus the later A5 join', () => {
    const added = store.membershipEvents.filter((e) => e.eventType === 'added');
    const addedIds = added.map((e) => e.itemId);
    expect(addedIds).toContain('it.a1');
    expect(addedIds).toContain('it.a5');
    expect(addedIds).toContain('it.a4');
  });

  it('history of a corrected member is preserved (added THEN removed)', () => {
    const a4 = store.eventsForItem('it.a4');
    expect(a4.map((e) => e.eventType)).toEqual(['added', 'removed_as_error']);
  });
});

describe('7. correction events', () => {
  const { store, identityById } = buildClusterScenario();
  const clusters = confirmedClusters(store, identityById);

  it('a correction is an append-only removed_as_error event', () => {
    const corrections = correctionEventsFor(store, CLUSTER_A_ID);
    expect(corrections).toHaveLength(1);
    expect(corrections[0].itemId).toBe('it.a4');
    expect(corrections[0].eventType).toBe('removed_as_error');
  });

  it('the corrected member is excluded from the current view, cluster marked corrected', () => {
    expect(clusters[0].confirmedMemberItemIds).not.toContain('it.a4');
    expect(clusters[0].clusterStatus).toBe('corrected');
  });
});

describe('8. confirmedMemberCount / sourceCount', () => {
  const { store, identityById } = buildClusterScenario();
  const cluster = confirmedClusters(store, identityById)[0];

  it('counts only currently-active confirmed members', () => {
    expect(cluster.confirmedMemberCount).toBe(4);
  });

  it('source count derives from confirmed members', () => {
    expect(cluster.sourceCount).toBe(4);
    expect(cluster.sourceIds).toEqual(['src.dataset.c', 'src.wire.a', 'src.wire.b', 'src.wire.d']);
  });
});
