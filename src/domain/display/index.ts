import type {
  ExternalItem,
  FreshnessState,
  PriorityTier,
  UrgencyLabel,
  VerificationTier,
} from '../types';
import type { PriorityResult } from '../priority';
import type { ConfirmedCluster } from '../clustering/types';
import type { CalendarEventView } from '../calendar';
import type { ConfirmationState } from '../calendar';

export type EvidenceReferenceType =
  | 'url'
  | 'sourceItemId'
  | 'itemId'
  | 'rawPayloadId'
  | 'calendarSourceEventId'
  | 'none';

export interface EvidenceDisplay {
  label: string;
  referenceType: EvidenceReferenceType;
  referenceValue: string;
  href?: string;
  isExternal: boolean;
}

export const buildEvidenceDisplay = (
  item: Pick<ExternalItem, 'url' | 'sourceItemId' | 'itemId'>,
): EvidenceDisplay => {
  if (item.url) {
    return {
      label: 'Evidence',
      referenceType: 'url',
      referenceValue: item.url,
      href: item.url,
      isExternal: true,
    };
  }
  if (item.sourceItemId) {
    return {
      label: 'Source ref',
      referenceType: 'sourceItemId',
      referenceValue: item.sourceItemId,
      isExternal: false,
    };
  }
  return {
    label: 'Internal ref',
    referenceType: 'itemId',
    referenceValue: item.itemId,
    isExternal: false,
  };
};

export const buildCalendarEvidenceDisplay = (args: {
  sourceUrl?: string;
  sourceEventId: string;
}): EvidenceDisplay =>
  args.sourceUrl
    ? {
        label: 'Evidence',
        referenceType: 'url',
        referenceValue: args.sourceUrl,
        href: args.sourceUrl,
        isExternal: true,
      }
    : {
        label: 'Source ref',
        referenceType: 'calendarSourceEventId',
        referenceValue: args.sourceEventId,
        isExternal: false,
      };

export type CautionLevel = 'none' | 'low' | 'medium' | 'high';

export interface VerificationDisplay {
  verificationTier: VerificationTier;
  visualLabel: string;
  cautionLevel: CautionLevel;
  mayPromoteHighAttention: boolean;
}

const CAUTION: Record<VerificationTier, CautionLevel> = {
  verified: 'none',
  scheduled: 'none',
  reported: 'low',
  unverified: 'medium',
  rumor: 'high',
};

export const buildVerificationDisplay = (tier: VerificationTier): VerificationDisplay => ({
  verificationTier: tier,
  visualLabel: tier,
  cautionLevel: CAUTION[tier],
  mayPromoteHighAttention: tier === 'verified' || tier === 'reported' || tier === 'scheduled',
});

export interface FreshnessDisplay {
  freshnessState: FreshnessState;
  observedAt?: string;
  ingestedAt?: string;
  normalizedAt?: string;
  sourceEventTime?: string | null;
  caveat?: string;
}

const FRESHNESS_CAVEAT: Record<FreshnessState, string | undefined> = {
  live: undefined,
  delayed: 'source data is delayed',
  stale: 'source data may be stale',
  disconnected: 'source disconnected',
  unknown: 'freshness unknown',
};

export const buildFreshnessDisplay = (
  item: Pick<
    ExternalItem,
    'freshnessState' | 'observedAt' | 'ingestedAt' | 'normalizedAt' | 'sourceEventTime'
  >,
): FreshnessDisplay => ({
  freshnessState: item.freshnessState,
  observedAt: item.observedAt,
  ingestedAt: item.ingestedAt,
  normalizedAt: item.normalizedAt,
  sourceEventTime: item.sourceEventTime,
  caveat: FRESHNESS_CAVEAT[item.freshnessState],
});

export interface ConfirmedClusterDisplay {
  clusterId: string;
  confirmedMemberCount: number;
  sourceCount: number;
  clusterRuleVersion: string;
  membershipReasonSummary: string;
  correctionCount: number;
  detailHref: string;
  label: string;
}

export const buildConfirmedClusterDisplay = (
  cluster: ConfirmedCluster | undefined,
  opts: { correctionCount?: number; membershipReasonSummary?: string } = {},
): ConfirmedClusterDisplay | null => {
  if (!cluster || cluster.confirmedMemberCount < 2) return null;
  return {
    clusterId: cluster.clusterId,
    confirmedMemberCount: cluster.confirmedMemberCount,
    sourceCount: cluster.sourceCount,
    clusterRuleVersion: cluster.clusterRuleVersion,
    membershipReasonSummary:
      opts.membershipReasonSummary ?? 'confirmed by exact deterministic match',
    correctionCount: opts.correctionCount ?? (cluster.clusterStatus === 'corrected' ? 1 : 0),
    detailHref: '/clusters',
    label: 'Confirmed deterministic cluster',
  };
};

export interface PriorityDisplay {
  priorityTier: PriorityTier;
  urgencyLabel: UrgencyLabel;
  priorityReason: string;
  deterministicInputs: string[];
  usesConfirmedCluster: boolean;
  clusterRuleVersion?: string;
}

export const buildPriorityDisplay = (
  priority: PriorityResult,
  cluster: ConfirmedClusterDisplay | null,
): PriorityDisplay => {
  const usesConfirmedCluster =
    cluster !== null &&
    cluster.confirmedMemberCount > 1 &&
    /confirmed cluster/i.test(priority.priorityReason);
  return {
    priorityTier: priority.priorityTier,
    urgencyLabel: priority.urgencyLabel,
    priorityReason: priority.priorityReason,
    deterministicInputs: priority.priorityReason
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean),
    usesConfirmedCluster,
    clusterRuleVersion: usesConfirmedCluster ? cluster!.clusterRuleVersion : undefined,
  };
};

export interface CalendarConfirmationDisplay {
  scheduledFor: string | null;
  lastConfirmedAt: string;
  confirmationState: ConfirmationState;
  confirmationCaveat?: string;
  canPromoteHighAttention: boolean;
}

const CONFIRMATION_CAVEAT: Record<ConfirmationState, string | undefined> = {
  fresh: undefined,
  aging: 'confirmation aging',
  stale: 'stale — needs confirmation; not high-attention',
  unknown: 'confirmation unknown',
};

export const buildCalendarConfirmationDisplay = (
  view: CalendarEventView,
): CalendarConfirmationDisplay => ({
  scheduledFor: view.current.scheduledFor,
  lastConfirmedAt: view.effectiveLastConfirmedAt,
  confirmationState: view.confirmationState,
  confirmationCaveat: CONFIRMATION_CAVEAT[view.confirmationState],
  canPromoteHighAttention: view.promotion.eligible,
});

export type AuditTargetType = 'news_item' | 'cluster' | 'calendar_event' | 'source' | 'raw_payload';

export interface AuditLinkDisplay {
  label: string;
  href: string;
  targetType: AuditTargetType;
}

export const buildAuditLinkDisplay = (
  targetType: AuditTargetType,
  id?: string,
): AuditLinkDisplay => {
  switch (targetType) {
    case 'news_item':
      return { label: 'audit ↗', href: `/newsroom/${id ?? ''}`, targetType };
    case 'cluster':
      return { label: 'cluster detail ↗', href: '/clusters', targetType };
    case 'calendar_event':
      return { label: 'calendar ↗', href: '/calendar', targetType };
    case 'source':
      return { label: 'source ↗', href: '/sources', targetType };
    case 'raw_payload':
      return { label: 'ingestion ↗', href: '/ingestion', targetType };
  }
};

export interface ItemDisplay {
  evidence: EvidenceDisplay;
  verification: VerificationDisplay;
  freshness: FreshnessDisplay;
  priority: PriorityDisplay;
  cluster: ConfirmedClusterDisplay | null;
  auditLink: AuditLinkDisplay;
}

export const buildItemDisplay = (input: {
  item: ExternalItem;
  priority: PriorityResult;
  confirmedCluster?: ConfirmedCluster;
}): ItemDisplay => {
  const cluster = buildConfirmedClusterDisplay(input.confirmedCluster);
  return {
    evidence: buildEvidenceDisplay(input.item),
    verification: buildVerificationDisplay(input.item.verificationTier),
    freshness: buildFreshnessDisplay(input.item),
    priority: buildPriorityDisplay(input.priority, cluster),
    cluster,
    auditLink: buildAuditLinkDisplay('news_item', input.item.itemId),
  };
};
