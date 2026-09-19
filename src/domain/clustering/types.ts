export const DEDUPE_RULE_VERSION = 'dedupe-rule-v1';

export const CLUSTER_RULE_VERSION = 'cluster-rule-v1';

export type ClusterReasonType =
  | 'source_item_id_exact'
  | 'canonical_url_exact'
  | 'dedupe_hash_exact'
  | 'normalized_title_exact_strict'
  | 'explicit_fixture_mapping'
  | 'same_item_id_noop';

export type DedupeDecisionKind = 'same' | 'different';

export type MembershipEventType = 'added' | 'removed_as_error';

export type ClusterStatus = 'active' | 'corrected' | 'archived';

export interface CanonicalIdentity {
  itemId: string;
  sourceId: string;
  sourceItemId?: string;
  url?: string;
  canonicalUrl?: string;
  normalizedTitle?: string;
  dedupeHash: string;
  assetTags: string[];
  topicTags: string[];
  observedAt: string;
  sourceEventTime?: string | null;
  ruleVersion: string;
}

export interface DedupeDecision {
  dedupeDecisionId: string;
  itemA: string;
  itemB: string;
  decision: DedupeDecisionKind;
  reasonType?: ClusterReasonType;
  reasonDetail: string;
  ruleVersion: string;
  createdAt: string;
}

interface MembershipEventBase {
  membershipEventId: string;
  clusterId: string;
  itemId: string;
  ruleVersion: string;
  createdAt: string;

  evidence?: string;
}

export interface AddedMembershipEvent extends MembershipEventBase {
  eventType: 'added';
  reasonType: ClusterReasonType;
  reasonDetail: string;
}

export interface RemovedMembershipEvent extends MembershipEventBase {
  eventType: 'removed_as_error';
  reasonType?: ClusterReasonType;
  reasonDetail: string;
}

export type ClusterMembershipEvent = AddedMembershipEvent | RemovedMembershipEvent;

export interface ConfirmedCluster {
  clusterId: string;
  clusterTitle: string;
  clusterStatus: ClusterStatus;
  firstObservedAt: string;
  lastObservedAt: string;
  confirmedMemberItemIds: string[];
  confirmedMemberCount: number;
  sourceCount: number;
  sourceIds: string[];

  verificationTier?: string;
  priorityTier?: string;
  priorityReason?: string;
  clusterRuleVersion: string;
  createdAt: string;
  derivedUpdatedAt: string;
}
