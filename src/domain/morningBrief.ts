import type { ExternalItem, FixtureSnapshot } from './types';
import {
  annotateItems,
  ingestedItems,
  inspectableQuarantineItems,
  promotableItems,
} from './selectors';
import { buildConfirmedClustersFromItems } from './clustering';
import { buildConfirmedClusterDisplay, type ConfirmedClusterDisplay } from './display';

export const MAJOR_CLUSTERS_HEADING = 'Major source-backed clusters';

export interface MorningBriefSection {
  heading: string;
  lines: string[];
}

export interface MorningBrief {
  generatedAt: string;
  intro: string;
  sections: MorningBriefSection[];

  majorClusters: ConfirmedClusterDisplay[];
}

const fmt = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace('T', ' ').slice(0, 16);
};

const lineForItem = (it: ExternalItem, srcName: string): string =>
  `[${it.verificationTier}] ${srcName} · ${fmt(it.observedAt)} — ${it.title}`;

const lineForClusterDisplay = (d: ConfirmedClusterDisplay): string =>
  `${d.label}: ${d.clusterId} · ${d.confirmedMemberCount} confirmed members (${d.clusterRuleVersion}) · ${d.sourceCount} sources`;

export const buildMorningBrief = (snapshot: FixtureSnapshot, now: Date): MorningBrief => {
  const annotated = annotateItems(snapshot, now);
  const promotable = promotableItems(snapshot);
  const promotableIds = new Set(promotable.map((i) => i.itemId));
  const ingested = ingestedItems(snapshot);

  const scheduled = promotable.filter((i) => i.verificationTier === 'scheduled');

  const majorClusters: ConfirmedClusterDisplay[] = buildConfirmedClustersFromItems(promotable, {
    now: () => now,
  })
    .clusters.filter((c) => c.confirmedMemberCount >= 2)
    .sort((a, b) => b.confirmedMemberCount - a.confirmedMemberCount)
    .map((c) => buildConfirmedClusterDisplay(c))
    .filter((d): d is ConfirmedClusterDisplay => d !== null);

  const watchedAssets = ['Gold', 'DXY', 'SPX', 'VIX'];
  const watched = promotable.filter((i) =>
    i.tags.some(
      (t) =>
        (t.provenance === 'deterministic' || t.provenance === 'user_confirmed') &&
        t.tagType === 'asset' &&
        watchedAssets.includes(t.tagValue),
    ),
  );

  const ingestedLowTrust = ingested.filter(
    (i) => i.verificationTier === 'unverified' || i.verificationTier === 'rumor',
  );
  const quarantineNeedsReview = inspectableQuarantineItems(snapshot).filter(
    (i) => snapshot.sources.find((s) => s.sourceId === i.sourceId)?.legalStatus === 'needs_review',
  );
  const unverifiedOrRumorOrReview = [...ingestedLowTrust, ...quarantineNeedsReview];

  const attention = annotated
    .filter((a) => promotableIds.has(a.item.itemId))
    .filter((a) => a.priority.priorityTier === 'P0' || a.priority.priorityTier === 'P1')
    .map((a) => `[${a.priority.priorityTier}] ${a.source.name} — ${a.item.title}`);

  const ignoreUnlessEscalates = annotated
    .filter((a) => a.priority.priorityTier === 'P3' || a.priority.priorityTier === 'muted')
    .map(
      (a) =>
        `[${a.priority.priorityTier}] ${a.source.name} — ${a.item.title} (source: ${a.source.legalStatus})`,
    );

  const sourceById = (id: string) => snapshot.sources.find((s) => s.sourceId === id)?.name ?? id;

  const labelLine = (i: ExternalItem): string => {
    const src = snapshot.sources.find((s) => s.sourceId === i.sourceId);
    const base = lineForItem(i, sourceById(i.sourceId));
    return src?.legalStatus === 'needs_review' ? `${base} [needs review]` : base;
  };

  const sections: MorningBriefSection[] = [
    {
      heading: 'Scheduled events',
      lines: scheduled.map((i) => lineForItem(i, sourceById(i.sourceId))),
    },
    {
      heading: MAJOR_CLUSTERS_HEADING,
      lines: majorClusters.map(lineForClusterDisplay),
    },
    {
      heading: 'Relevant watched assets / topics',
      lines: watched.map((i) => lineForItem(i, sourceById(i.sourceId))),
    },
    {
      heading: 'Unverified / rumor / needs review (inspection only)',
      lines: unverifiedOrRumorOrReview.map(labelLine),
    },
    {
      heading: 'Items worth attention',
      lines: attention,
    },
    {
      heading: 'Items to ignore unless they escalate',
      lines: ignoreUnlessEscalates,
    },
  ];

  return {
    generatedAt: now.toISOString(),
    intro:
      'Source-backed snapshot from local fixture data. Counts and references only; no inferred market state.',
    sections,
    majorClusters,
  };
};
