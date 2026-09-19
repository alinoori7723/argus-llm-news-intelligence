import type { ClusterMembershipEvent, DedupeDecision } from './types';

export interface ClusterStore {
  nextId(prefix: string): string;
  appendMembershipEvent(e: ClusterMembershipEvent): void;
  appendDedupeDecision(d: DedupeDecision): void;
  readonly membershipEvents: readonly ClusterMembershipEvent[];
  readonly dedupeDecisions: readonly DedupeDecision[];

  eventsForCluster(clusterId: string): ClusterMembershipEvent[];

  eventsForItem(itemId: string): ClusterMembershipEvent[];

  currentClusterIdForItem(itemId: string): string | undefined;

  isActiveMember(clusterId: string, itemId: string): boolean;

  knownClusterIds(): string[];
}

export class AppendOnlyClusterStore implements ClusterStore {
  private readonly membershipEventsList: ClusterMembershipEvent[] = [];
  private readonly dedupeDecisionsList: DedupeDecision[] = [];
  private seq = 0;

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  appendMembershipEvent(e: ClusterMembershipEvent): void {
    this.membershipEventsList.push(e);
  }

  appendDedupeDecision(d: DedupeDecision): void {
    this.dedupeDecisionsList.push(d);
  }

  get membershipEvents(): readonly ClusterMembershipEvent[] {
    return [...this.membershipEventsList];
  }

  get dedupeDecisions(): readonly DedupeDecision[] {
    return [...this.dedupeDecisionsList];
  }

  eventsForCluster(clusterId: string): ClusterMembershipEvent[] {
    return this.membershipEventsList.filter((e) => e.clusterId === clusterId);
  }

  eventsForItem(itemId: string): ClusterMembershipEvent[] {
    return this.membershipEventsList.filter((e) => e.itemId === itemId);
  }

  currentClusterIdForItem(itemId: string): string | undefined {
    let current: ClusterMembershipEvent | undefined;
    for (const e of this.membershipEventsList) {
      if (e.itemId === itemId) current = e;
    }
    return current && current.eventType === 'added' ? current.clusterId : undefined;
  }

  isActiveMember(clusterId: string, itemId: string): boolean {
    let latest: ClusterMembershipEvent | undefined;
    for (const e of this.membershipEventsList) {
      if (e.clusterId === clusterId && e.itemId === itemId) latest = e;
    }
    return latest?.eventType === 'added';
  }

  knownClusterIds(): string[] {
    return Array.from(new Set(this.membershipEventsList.map((e) => e.clusterId)));
  }
}
