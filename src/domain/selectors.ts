import type {
  ExternalItem,
  FixtureSnapshot,
  SourceCluster,
  SourceProfile,
  VerificationTier,
} from './types';
import { recomputeClusterPriority, type PriorityResult } from './priority';
import {
  buildConfirmedClustersFromItems,
  computePriorityForClusteredItem,
  type ConfirmedCluster,
} from './clustering';

export interface AnnotatedItem {
  item: ExternalItem;
  source: SourceProfile;
  priority: PriorityResult;

  confirmedMemberCount: number;

  confirmedClusterId?: string;

  confirmedCluster?: ConfirmedCluster;
}

const sourceById = (snapshot: FixtureSnapshot, id: string) =>
  snapshot.sources.find((s) => s.sourceId === id);

export const ingestibleSources = (snapshot: FixtureSnapshot): SourceProfile[] =>
  snapshot.sources.filter((s) => s.enabled === true && s.legalStatus === 'allowed');

export const quarantinedSources = (snapshot: FixtureSnapshot): SourceProfile[] =>
  snapshot.sources.filter((s) => s.legalStatus === 'needs_review' || s.legalStatus === 'disabled');

const ingestibleSourceIdSet = (snapshot: FixtureSnapshot): Set<string> =>
  new Set(ingestibleSources(snapshot).map((s) => s.sourceId));

const quarantinedSourceIdSet = (snapshot: FixtureSnapshot): Set<string> =>
  new Set(quarantinedSources(snapshot).map((s) => s.sourceId));

export const ingestedItems = (snapshot: FixtureSnapshot): ExternalItem[] => {
  const ok = ingestibleSourceIdSet(snapshot);
  return snapshot.items.filter((it) => ok.has(it.sourceId));
};

export const visibleItems = ingestedItems;

export const inspectableQuarantineItems = (snapshot: FixtureSnapshot): ExternalItem[] => {
  const q = quarantinedSourceIdSet(snapshot);
  return snapshot.items.filter((it) => q.has(it.sourceId));
};

const PROMOTABLE_VERIFICATION_TIERS: ReadonlySet<VerificationTier> = new Set<VerificationTier>([
  'verified',
  'reported',
  'scheduled',
]);

export const hasPromotionEvidence = (item: ExternalItem): boolean =>
  Boolean(item.url) || Boolean(item.sourceItemId);

export const promotableItems = (snapshot: FixtureSnapshot): ExternalItem[] => {
  const ok = ingestibleSourceIdSet(snapshot);
  return snapshot.items.filter(
    (it) =>
      ok.has(it.sourceId) &&
      hasPromotionEvidence(it) &&
      PROMOTABLE_VERIFICATION_TIERS.has(it.verificationTier),
  );
};

export const annotateItems = (snapshot: FixtureSnapshot, now: Date): AnnotatedItem[] => {
  const items = visibleItems(snapshot);

  const clusterView = buildConfirmedClustersFromItems(items, {
    now: () => now,
  });
  return items.map((item) => {
    const source = sourceById(snapshot, item.sourceId)!;
    const confirmedCluster = clusterView.forItem(item.itemId);
    const priority = computePriorityForClusteredItem({
      item,
      source,
      now,
      confirmedCluster,
    });
    return {
      item,
      source,
      priority,
      confirmedMemberCount: confirmedCluster?.confirmedMemberCount ?? 1,
      confirmedClusterId: confirmedCluster?.clusterId,
      confirmedCluster,
    };
  });
};

export const promotableAnnotatedItems = (snapshot: FixtureSnapshot, now: Date): AnnotatedItem[] => {
  const promotableIds = new Set(promotableItems(snapshot).map((i) => i.itemId));
  return annotateItems(snapshot, now).filter((a) => promotableIds.has(a.item.itemId));
};

export const annotateClusters = (
  snapshot: FixtureSnapshot,
  now: Date,
): (SourceCluster & { recomputed: PriorityResult })[] =>
  snapshot.clusters.map((c) => ({
    ...c,
    recomputed: recomputeClusterPriority(c, snapshot, now),
  }));

export type PulseKey = 'gold' | 'dxy' | 'spx' | 'vix' | 'news' | 'world';

export interface PulseCell {
  key: PulseKey;
  label: 'Gold' | 'DXY' | 'S&P' | 'VIX' | 'News' | 'World';
  matchingItemIds: string[];
  matchingClusterIds: string[];
  lastObservedAt?: string;
  count: number;

  summary: string;
}

const itemMatchesAsset = (item: ExternalItem, asset: string): boolean =>
  item.tags.some(
    (t) =>
      (t.provenance === 'deterministic' || t.provenance === 'user_confirmed') &&
      t.tagType === 'asset' &&
      t.tagValue.toLowerCase() === asset.toLowerCase(),
  );

const clusterMatchesAsset = (c: SourceCluster, asset: string): boolean =>
  c.tags.some(
    (t) =>
      (t.provenance === 'deterministic' || t.provenance === 'user_confirmed') &&
      t.tagType === 'asset' &&
      t.tagValue.toLowerCase() === asset.toLowerCase(),
  );

const itemIsNewsy = (item: ExternalItem): boolean =>
  item.verificationTier === 'scheduled' ||
  item.tags.some(
    (t) =>
      (t.provenance === 'deterministic' || t.provenance === 'user_confirmed') &&
      (t.tagType === 'macro' || t.tagType === 'topic'),
  );

const itemMatchesWorld = (item: ExternalItem): boolean =>
  item.tags.some(
    (t) =>
      (t.provenance === 'deterministic' || t.provenance === 'user_confirmed') &&
      (t.tagType === 'region' || (t.tagType === 'topic' && /geopolit|risk/i.test(t.tagValue))),
  );

const ageLabelInline = (iso: string, now: Date): string => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unknown';
  const diff = Math.max(0, Math.floor((now.getTime() - t) / 60_000));
  if (diff < 1) return 'live';
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

const buildCell = (
  key: PulseKey,
  label: PulseCell['label'],
  matchingItems: ExternalItem[],
  matchingClusters: SourceCluster[],
  now: Date,
): PulseCell => {
  const allTimes = [
    ...matchingItems.map((i) => Date.parse(i.observedAt)),
    ...matchingClusters.map((c) => Date.parse(c.lastObservedAt)),
  ].filter((t) => !Number.isNaN(t));
  const lastTs = allTimes.length ? Math.max(...allTimes) : undefined;
  const lastObservedAt = lastTs ? new Date(lastTs).toISOString() : undefined;
  const count = matchingItems.length;
  const summary =
    count > 0
      ? `${label}: ${count} related headlines · ${lastObservedAt ? ageLabelInline(lastObservedAt, now) : 'live'}`
      : `${label}: no major source update · live`;
  return {
    key,
    label,
    matchingItemIds: matchingItems.map((i) => i.itemId),
    matchingClusterIds: matchingClusters.map((c) => c.clusterId),
    lastObservedAt,
    count,
    summary,
  };
};

export const computePulseCells = (snapshot: FixtureSnapshot, now: Date): PulseCell[] => {
  const items = promotableItems(snapshot);
  const promotableItemIds = new Set(items.map((i) => i.itemId));
  const promotableClusters = snapshot.clusters.filter((c) =>
    c.itemIds.some((id) => promotableItemIds.has(id)),
  );

  const goldItems = items.filter((i) => itemMatchesAsset(i, 'Gold'));
  const dxyItems = items.filter((i) => itemMatchesAsset(i, 'DXY'));
  const spxItems = items.filter((i) => itemMatchesAsset(i, 'SPX'));
  const vixItems = items.filter((i) => itemMatchesAsset(i, 'VIX'));
  const newsItems = items.filter(itemIsNewsy);
  const worldItems = items.filter(itemMatchesWorld);

  const goldClusters = promotableClusters.filter((c) => clusterMatchesAsset(c, 'Gold'));
  const dxyClusters = promotableClusters.filter((c) => clusterMatchesAsset(c, 'DXY'));
  const spxClusters = promotableClusters.filter((c) => clusterMatchesAsset(c, 'SPX'));
  const vixClusters = promotableClusters.filter((c) => clusterMatchesAsset(c, 'VIX'));
  const worldClusters = promotableClusters.filter((c) =>
    c.tags.some(
      (t) =>
        (t.provenance === 'deterministic' || t.provenance === 'user_confirmed') &&
        (t.tagType === 'region' || (t.tagType === 'topic' && /geopolit|risk/i.test(t.tagValue))),
    ),
  );
  const newsClusters = promotableClusters.filter((c) =>
    c.tags.some(
      (t) =>
        (t.provenance === 'deterministic' || t.provenance === 'user_confirmed') &&
        (t.tagType === 'macro' || t.tagType === 'topic'),
    ),
  );

  return [
    buildCell('gold', 'Gold', goldItems, goldClusters, now),
    buildCell('dxy', 'DXY', dxyItems, dxyClusters, now),
    buildCell('spx', 'S&P', spxItems, spxClusters, now),
    buildCell('vix', 'VIX', vixItems, vixClusters, now),
    buildCell('news', 'News', newsItems, newsClusters, now),
    buildCell('world', 'World', worldItems, worldClusters, now),
  ];
};

export type WorldRegionKey =
  | 'us_fed_usd'
  | 'eu_ecb_eur'
  | 'china_demand_macro'
  | 'me_geopolitics_oil_gold'
  | 'global_risk_vol_equities_bonds';

export interface WorldRegion {
  key: WorldRegionKey;
  title: string;
  itemIds: string[];
  clusterIds: string[];
  sourceCount: number;
}

const itemRegionKey = (item: ExternalItem): WorldRegionKey | null => {
  const allow = (t: { provenance: string }) =>
    t.provenance === 'deterministic' || t.provenance === 'user_confirmed';
  const tags = item.tags.filter(allow);
  const find = (pred: (v: string) => boolean) =>
    tags.find((t) => pred(t.tagValue.toLowerCase()) || pred(t.tagId.toLowerCase()));
  if (
    find((v) => /fed|powell|usd|fomc/.test(v)) ||
    tags.some((t) => t.tagType === 'region' && /us|united-states/.test(t.tagValue.toLowerCase()))
  )
    return 'us_fed_usd';
  if (
    find((v) => /ecb|euro|eur/.test(v)) ||
    tags.some((t) => t.tagType === 'region' && /eu|europe/.test(t.tagValue.toLowerCase()))
  )
    return 'eu_ecb_eur';
  if (
    find((v) => /china|cn|demand/.test(v)) ||
    tags.some((t) => t.tagType === 'region' && /china/.test(t.tagValue.toLowerCase()))
  )
    return 'china_demand_macro';
  if (
    find((v) => /middle-east|oil|gold|geopolit/.test(v)) ||
    tags.some((t) => t.tagType === 'region' && /middle-east/.test(t.tagValue.toLowerCase()))
  )
    return 'me_geopolitics_oil_gold';
  if (find((v) => /risk|vix|spx|bond|equit/.test(v))) return 'global_risk_vol_equities_bonds';
  return null;
};

export const computeWorldRegions = (snapshot: FixtureSnapshot): WorldRegion[] => {
  const groups: Record<WorldRegionKey, WorldRegion> = {
    us_fed_usd: {
      key: 'us_fed_usd',
      title: 'United States / Fed / USD',
      itemIds: [],
      clusterIds: [],
      sourceCount: 0,
    },
    eu_ecb_eur: {
      key: 'eu_ecb_eur',
      title: 'Europe / ECB / EUR',
      itemIds: [],
      clusterIds: [],
      sourceCount: 0,
    },
    china_demand_macro: {
      key: 'china_demand_macro',
      title: 'China / demand / macro',
      itemIds: [],
      clusterIds: [],
      sourceCount: 0,
    },
    me_geopolitics_oil_gold: {
      key: 'me_geopolitics_oil_gold',
      title: 'Middle East / geopolitics / oil / gold',
      itemIds: [],
      clusterIds: [],
      sourceCount: 0,
    },
    global_risk_vol_equities_bonds: {
      key: 'global_risk_vol_equities_bonds',
      title: 'Global risk / volatility / equities / bonds',
      itemIds: [],
      clusterIds: [],
      sourceCount: 0,
    },
  };

  const items = ingestedItems(snapshot);
  const sourceSets: Record<WorldRegionKey, Set<string>> = {
    us_fed_usd: new Set(),
    eu_ecb_eur: new Set(),
    china_demand_macro: new Set(),
    me_geopolitics_oil_gold: new Set(),
    global_risk_vol_equities_bonds: new Set(),
  };

  for (const item of items) {
    const k = itemRegionKey(item);
    if (!k) continue;
    groups[k].itemIds.push(item.itemId);
    sourceSets[k].add(item.sourceId);
  }

  for (const cluster of snapshot.clusters) {
    const sample = items.find((i) => cluster.itemIds.includes(i.itemId));
    if (!sample) continue;
    const k = itemRegionKey(sample);
    if (!k) continue;
    groups[k].clusterIds.push(cluster.clusterId);
  }

  for (const k of Object.keys(groups) as WorldRegionKey[]) {
    groups[k].sourceCount = sourceSets[k].size;
  }

  return Object.values(groups);
};
