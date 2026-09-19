import type { ClusterStore } from './store';
import {
  CLUSTER_RULE_VERSION,
  type CanonicalIdentity,
  type ClusterMembershipEvent,
  type ConfirmedCluster,
} from './types';

export type IdentityById = Record<string, CanonicalIdentity>;

export const identityIndex = (identities: CanonicalIdentity[]): IdentityById =>
  Object.fromEntries(identities.map((i) => [i.itemId, i]));

const activeMemberItemIds = (store: ClusterStore, clusterId: string): string[] => {
  const seen = new Set<string>();
  for (const e of store.eventsForCluster(clusterId)) seen.add(e.itemId);
  return Array.from(seen)
    .filter((itemId) => store.isActiveMember(clusterId, itemId))
    .sort();
};

const minBy = <T>(xs: T[], key: (x: T) => string): T | undefined =>
  xs.reduce<T | undefined>(
    (best, x) => (best === undefined || key(x) < key(best) ? x : best),
    undefined,
  );

export const toConfirmedCluster = (
  store: ClusterStore,
  clusterId: string,
  identityById: IdentityById,
): ConfirmedCluster | undefined => {
  const memberIds = activeMemberItemIds(store, clusterId);
  const events = store.eventsForCluster(clusterId);
  const addedEvents = events.filter((e) => e.eventType === 'added');
  const corrected = events.some((e) => e.eventType === 'removed_as_error');

  const members = memberIds
    .map((id) => identityById[id])
    .filter((x): x is CanonicalIdentity => x !== undefined);

  const sourceIds = Array.from(new Set(members.map((m) => m.sourceId))).sort();
  const observedTimes = members.map((m) => m.observedAt).filter(Boolean);
  const earliest = minBy(members, (m) => `${m.observedAt}|${m.itemId}`);
  const addedTimes = addedEvents.map((e) => e.createdAt);

  return {
    clusterId,
    clusterTitle: earliest?.normalizedTitle ?? earliest?.dedupeHash ?? clusterId,
    clusterStatus: corrected ? 'corrected' : 'active',
    firstObservedAt: observedTimes.length ? observedTimes.slice().sort()[0] : '',
    lastObservedAt: observedTimes.length
      ? observedTimes.slice().sort()[observedTimes.length - 1]
      : '',
    confirmedMemberItemIds: memberIds,
    confirmedMemberCount: memberIds.length,
    sourceCount: sourceIds.length,
    sourceIds,
    clusterRuleVersion: CLUSTER_RULE_VERSION,
    createdAt: addedTimes.length ? addedTimes.slice().sort()[0] : '',
    derivedUpdatedAt: events.length ? events.map((e) => e.createdAt).sort()[events.length - 1] : '',
  };
};

export const confirmedClusters = (
  store: ClusterStore,
  identityById: IdentityById,
): ConfirmedCluster[] =>
  store
    .knownClusterIds()
    .map((id) => toConfirmedCluster(store, id, identityById))
    .filter((c): c is ConfirmedCluster => c !== undefined && c.confirmedMemberCount > 0)
    .sort((a, b) => (a.clusterId < b.clusterId ? -1 : 1));

export const confirmedClusterForItem = (
  clusters: ConfirmedCluster[],
  itemId: string,
): ConfirmedCluster | undefined => clusters.find((c) => c.confirmedMemberItemIds.includes(itemId));

export const membershipReasonFor = (
  store: ClusterStore,
  clusterId: string,
  itemId: string,
): ClusterMembershipEvent | undefined => {
  let latest: ClusterMembershipEvent | undefined;
  for (const e of store.eventsForCluster(clusterId)) {
    if (e.itemId === itemId && e.eventType === 'added') latest = e;
  }
  return latest;
};

export const correctionEventsFor = (
  store: ClusterStore,
  clusterId: string,
): ClusterMembershipEvent[] =>
  store.eventsForCluster(clusterId).filter((e) => e.eventType === 'removed_as_error');
