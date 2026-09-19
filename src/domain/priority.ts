import type {
  ExternalItem,
  FixtureSnapshot,
  PriorityTier,
  SourceCluster,
  SourceProfile,
  Tag,
  TagProvenance,
  UrgencyLabel,
  VerificationTier,
} from './types';

const ALLOWED_TAG_PROVENANCES: ReadonlySet<TagProvenance> = new Set<TagProvenance>([
  'deterministic',
  'user_confirmed',
]);

export const isUsableForPriority = (tag: Tag): boolean =>
  ALLOWED_TAG_PROVENANCES.has(tag.provenance);

export const filterDeterministicTags = (tags: Tag[]): Tag[] => tags.filter(isUsableForPriority);

const SCHEDULED_MACRO_KEYWORDS = [
  'fomc',
  'cpi',
  'nfp',
  'powell',
  'ecb',
  'boj',
  'jobless',
  'pmi',
  'gdp',
];

const matchesScheduledMacro = (tags: Tag[]): boolean => {
  const usable = filterDeterministicTags(tags);
  return usable.some((t) => {
    const v = t.tagValue.toLowerCase();
    return t.tagType === 'macro' && SCHEDULED_MACRO_KEYWORDS.some((k) => v.includes(k));
  });
};

const minutesSince = (iso: string, now: Date): number => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now.getTime() - t) / 60_000));
};

const sourceTierScore = (tier: SourceProfile['sourceTier']): number => {
  switch (tier) {
    case 'primary':
      return 3;
    case 'reputable':
      return 2;
    case 'curated':
      return 1;
    case 'unknown':
      return 0;
    case 'experimental':
      return 0;
    default:
      return 0;
  }
};

const verificationScore = (v: VerificationTier): number => {
  switch (v) {
    case 'verified':
      return 3;
    case 'scheduled':
      return 2;
    case 'reported':
      return 1;
    case 'unverified':
      return 0;
    case 'rumor':
      return -1;
    default:
      return 0;
  }
};

export interface PriorityInputs {
  item: ExternalItem;
  source: SourceProfile;

  confirmedClusterSize?: number;

  now: Date;
}

export interface PriorityResult {
  priorityTier: PriorityTier;
  urgencyLabel: UrgencyLabel;
  priorityReason: string;
}

export const computePriority = ({
  item,
  source,
  confirmedClusterSize = 1,
  now,
}: PriorityInputs): PriorityResult => {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error(
      'computePriority requires a deterministic `now` argument; wall-clock fallback is forbidden.',
    );
  }
  if (source.legalStatus === 'disabled' || !source.enabled) {
    return {
      priorityTier: 'muted',
      urgencyLabel: 'muted',
      priorityReason: `Source ${source.name} is disabled — item suppressed from priority surfaces.`,
    };
  }

  let score = 0;
  const reasons: string[] = [];

  const tierScore = sourceTierScore(source.sourceTier);
  score += tierScore;
  reasons.push(`source tier ${source.sourceTier} (+${tierScore})`);

  const vScore = verificationScore(item.verificationTier);
  score += vScore;
  reasons.push(`verification ${item.verificationTier} (${vScore >= 0 ? '+' : ''}${vScore})`);

  if (matchesScheduledMacro(item.tags)) {
    score += 2;
    reasons.push('scheduled macro keyword match (+2)');
  }

  if (confirmedClusterSize >= 4) {
    score += 2;
    reasons.push(`confirmed cluster size ${confirmedClusterSize} (+2)`);
  } else if (confirmedClusterSize >= 2) {
    score += 1;
    reasons.push(`confirmed cluster size ${confirmedClusterSize} (+1)`);
  }

  const ageMin = minutesSince(item.observedAt, now);
  let recencyBoost = 0;
  if (ageMin <= 15) recencyBoost = 2;
  else if (ageMin <= 60) recencyBoost = 1;
  else if (ageMin >= 60 * 12) recencyBoost = -1;
  if (recencyBoost !== 0) {
    score += recencyBoost;
    reasons.push(`recency ${ageMin}m (${recencyBoost >= 0 ? '+' : ''}${recencyBoost})`);
  }

  if (source.legalStatus === 'needs_review') {
    score = Math.min(score, 1);
    reasons.push('source needs_review — capped at P3');
  }

  if (item.freshnessState === 'stale' || item.freshnessState === 'disconnected') {
    score -= 1;
    reasons.push(`freshness ${item.freshnessState} (-1)`);
  }

  let priorityTier: PriorityTier;
  if (score >= 7) priorityTier = 'P0';
  else if (score >= 5) priorityTier = 'P1';
  else if (score >= 3) priorityTier = 'P2';
  else if (score >= 1) priorityTier = 'P3';
  else priorityTier = 'muted';

  const TIER_ORDER: PriorityTier[] = ['P0', 'P1', 'P2', 'P3', 'muted'];
  const capTierTo = (tier: PriorityTier, floor: PriorityTier): PriorityTier =>
    TIER_ORDER.indexOf(tier) < TIER_ORDER.indexOf(floor) ? floor : tier;

  if (item.verificationTier === 'rumor') {
    const capped = capTierTo(priorityTier, 'P3');
    if (capped !== priorityTier) {
      reasons.push(`rumor verification cap → ${capped}`);
    }
    priorityTier = capped;
  } else if (item.verificationTier === 'unverified') {
    const capped = capTierTo(priorityTier, 'P2');
    if (capped !== priorityTier) {
      reasons.push(`unverified verification cap → ${capped}`);
    }
    priorityTier = capped;
  }

  let urgencyLabel: UrgencyLabel;
  if (item.verificationTier === 'scheduled') {
    urgencyLabel = 'soon';
  } else if (priorityTier === 'P0') {
    urgencyLabel = 'now';
  } else if (priorityTier === 'P1') {
    urgencyLabel = 'soon';
  } else if (priorityTier === 'P2') {
    urgencyLabel = 'today';
  } else if (priorityTier === 'P3') {
    urgencyLabel = 'background';
  } else {
    urgencyLabel = 'muted';
  }

  if (item.verificationTier === 'rumor') {
    const cappedUrgency: UrgencyLabel = urgencyLabel === 'muted' ? 'muted' : 'background';
    if (cappedUrgency !== urgencyLabel) {
      reasons.push(`rumor urgency cap → ${cappedUrgency}`);
    }
    urgencyLabel = cappedUrgency;
  } else if (item.verificationTier === 'unverified' && urgencyLabel === 'now') {
    urgencyLabel = 'soon';
    reasons.push('unverified urgency cap → soon');
  }

  if (source.legalStatus === 'needs_review') {
    const cappedUrgency: UrgencyLabel = urgencyLabel === 'muted' ? 'muted' : 'background';
    if (cappedUrgency !== urgencyLabel) {
      reasons.push(`needs_review urgency cap → ${cappedUrgency}`);
    }
    urgencyLabel = cappedUrgency;
  }

  return {
    priorityTier,
    urgencyLabel,
    priorityReason: reasons.join('; '),
  };
};

export interface DerivedCluster extends SourceCluster {
  itemIds: string[];
}

export const recomputeClusterPriority = (
  cluster: SourceCluster,
  snapshot: FixtureSnapshot,
  now: Date,
): PriorityResult => {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error(
      'recomputeClusterPriority requires a deterministic `now` argument; wall-clock fallback is forbidden.',
    );
  }
  const items = snapshot.items.filter((i) => cluster.itemIds.includes(i.itemId));
  if (items.length === 0) {
    return {
      priorityTier: 'muted',
      urgencyLabel: 'muted',
      priorityReason: 'no members',
    };
  }

  const perItem = items
    .map((it) => {
      const src = snapshot.sources.find((s) => s.sourceId === it.sourceId);
      if (!src) return null;
      return computePriority({
        item: it,
        source: src,

        confirmedClusterSize: items.length,
        now,
      });
    })
    .filter((x): x is PriorityResult => x !== null);

  const order: PriorityTier[] = ['P0', 'P1', 'P2', 'P3', 'muted'];
  const best = perItem.reduce<PriorityTier>((acc, r) => {
    return order.indexOf(r.priorityTier) < order.indexOf(acc) ? r.priorityTier : acc;
  }, 'muted');

  let urgencyLabel: UrgencyLabel;
  switch (best) {
    case 'P0':
      urgencyLabel = 'now';
      break;
    case 'P1':
      urgencyLabel = 'soon';
      break;
    case 'P2':
      urgencyLabel = 'today';
      break;
    case 'P3':
      urgencyLabel = 'background';
      break;
    default:
      urgencyLabel = 'muted';
  }

  return {
    priorityTier: best,
    urgencyLabel,
    priorityReason: `derived from ${perItem.length} member item(s); cluster size ${items.length}`,
  };
};
