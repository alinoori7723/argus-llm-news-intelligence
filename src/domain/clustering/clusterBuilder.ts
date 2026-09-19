import type { Clock } from '../ingestion/types';
import { decideDedupe, type DedupeOptions, type SameMatch } from './dedupe';
import type { ClusterStore } from './store';
import { CLUSTER_RULE_VERSION, DEDUPE_RULE_VERSION, type CanonicalIdentity } from './types';

export class ConfirmedClusterEngine {
  private readonly identities: CanonicalIdentity[] = [];
  private readonly removed = new Set<string>();

  constructor(
    private readonly store: ClusterStore,
    private readonly clock: Clock,

    private readonly dedupeOptions: DedupeOptions = {},
  ) {}

  private removalKey(clusterId: string, itemId: string): string {
    return `${clusterId}::${itemId}`;
  }

  private appendAdded(clusterId: string, identity: CanonicalIdentity, match: SameMatch): void {
    if (this.removed.has(this.removalKey(clusterId, identity.itemId))) return;
    if (this.store.isActiveMember(clusterId, identity.itemId)) return;
    this.store.appendMembershipEvent({
      membershipEventId: this.store.nextId('cme'),
      clusterId,
      itemId: identity.itemId,
      eventType: 'added',
      reasonType: match.reasonType,
      reasonDetail: match.reasonDetail,
      ruleVersion: CLUSTER_RULE_VERSION,
      createdAt: this.clock.now().toISOString(),
      evidence: match.evidence,
    });
  }

  private recordDecision(a: CanonicalIdentity, b: CanonicalIdentity, match: SameMatch): void {
    this.store.appendDedupeDecision({
      dedupeDecisionId: this.store.nextId('ddx'),
      itemA: a.itemId,
      itemB: b.itemId,
      decision: match.decision,
      reasonType: match.reasonType,
      reasonDetail: match.reasonDetail,
      ruleVersion: DEDUPE_RULE_VERSION,
      createdAt: this.clock.now().toISOString(),
    });
  }

  add(identity: CanonicalIdentity): void {
    const matches: { prior: CanonicalIdentity; match: SameMatch }[] = [];
    for (const prior of this.identities) {
      const match = decideDedupe(identity, prior, this.dedupeOptions);
      if (match.decision === 'same' && match.reasonType !== 'same_item_id_noop') {
        this.recordDecision(identity, prior, match);
        matches.push({ prior, match });
      }
    }

    if (matches.length === 0) {
      this.identities.push(identity);
      return;
    }

    const sortedMatches = [...matches].sort((x, y) => (x.prior.itemId < y.prior.itemId ? -1 : 1));
    const chosen = sortedMatches[0];

    const matchedClusterIds = Array.from(
      new Set(
        sortedMatches
          .map((m) => this.store.currentClusterIdForItem(m.prior.itemId))
          .filter((c): c is string => c !== undefined),
      ),
    ).sort();

    if (matchedClusterIds.length >= 1) {
      const clusterId = matchedClusterIds[0];
      this.appendAdded(clusterId, identity, chosen.match);
    } else {
      const groupItemIds = [identity.itemId, ...sortedMatches.map((m) => m.prior.itemId)];
      const minItemId = groupItemIds.slice().sort()[0];
      const clusterId = `ccl-${minItemId}`;
      for (const m of sortedMatches) {
        this.appendAdded(clusterId, m.prior, m.match);
      }
      this.appendAdded(clusterId, identity, chosen.match);
    }

    this.identities.push(identity);
  }

  addAll(identities: CanonicalIdentity[]): void {
    for (const id of identities) this.add(id);
  }

  removeMemberAsError(clusterId: string, itemId: string, reasonDetail: string): void {
    this.removed.add(this.removalKey(clusterId, itemId));
    this.store.appendMembershipEvent({
      membershipEventId: this.store.nextId('cme'),
      clusterId,
      itemId,
      eventType: 'removed_as_error',
      reasonDetail,
      ruleVersion: CLUSTER_RULE_VERSION,
      createdAt: this.clock.now().toISOString(),
    });
  }
}
