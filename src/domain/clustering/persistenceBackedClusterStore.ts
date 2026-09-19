import { deepClone, deepFreeze, type AppendOnlyPersistenceStore } from '../persistence';
import type { ClusterMembershipEvent, DedupeDecision } from './types';
import type { ClusterStore } from './store';
import { mapDedupeDecisionToInput, mapMembershipEventToInput } from './clusterPersistenceMapping';
import {
  CLUSTER_DEDUPE_DECISIONS_STREAM,
  CLUSTER_MEMBERSHIP_EVENTS_STREAM,
} from './clusterPersistenceStreams';

export class PersistenceBackedClusterStore implements ClusterStore {
  private seq = 0;

  constructor(private readonly store: AppendOnlyPersistenceStore) {}

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  appendMembershipEvent(e: ClusterMembershipEvent): void {
    const s = this.store.readStream(CLUSTER_MEMBERSHIP_EVENTS_STREAM).length;
    this.store.append(mapMembershipEventToInput(e, s));
  }

  appendDedupeDecision(d: DedupeDecision): void {
    const s = this.store.readStream(CLUSTER_DEDUPE_DECISIONS_STREAM).length;
    this.store.append(mapDedupeDecisionToInput(d, s));
  }

  private read<T>(streamName: string): T[] {
    return this.store.readStream(streamName).map((r) => deepFreeze(deepClone(r.payload)) as T);
  }

  get membershipEvents(): readonly ClusterMembershipEvent[] {
    return Object.freeze(this.read<ClusterMembershipEvent>(CLUSTER_MEMBERSHIP_EVENTS_STREAM));
  }

  get dedupeDecisions(): readonly DedupeDecision[] {
    return Object.freeze(this.read<DedupeDecision>(CLUSTER_DEDUPE_DECISIONS_STREAM));
  }

  eventsForCluster(clusterId: string): ClusterMembershipEvent[] {
    return this.store
      .readStream(CLUSTER_MEMBERSHIP_EVENTS_STREAM, clusterId)
      .map((r) => deepFreeze(deepClone(r.payload)) as ClusterMembershipEvent);
  }

  eventsForItem(itemId: string): ClusterMembershipEvent[] {
    return this.membershipEvents.filter((e) => e.itemId === itemId);
  }

  currentClusterIdForItem(itemId: string): string | undefined {
    let current: ClusterMembershipEvent | undefined;
    for (const e of this.membershipEvents) {
      if (e.itemId === itemId) current = e;
    }
    return current && current.eventType === 'added' ? current.clusterId : undefined;
  }

  isActiveMember(clusterId: string, itemId: string): boolean {
    let latest: ClusterMembershipEvent | undefined;
    for (const e of this.eventsForCluster(clusterId)) {
      if (e.itemId === itemId) latest = e;
    }
    return latest?.eventType === 'added';
  }

  knownClusterIds(): string[] {
    return Array.from(new Set(this.membershipEvents.map((e) => e.clusterId)));
  }
}
