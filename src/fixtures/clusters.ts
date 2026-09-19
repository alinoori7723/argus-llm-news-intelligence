import type { SourceCluster } from '@/domain/types';
import { FIXTURE_NOW } from './items';

const hoursAgo = (n: number) => new Date(FIXTURE_NOW.getTime() - n * 3600_000).toISOString();
const minutesAgo = (n: number) => new Date(FIXTURE_NOW.getTime() - n * 60_000).toISOString();

export const FIXTURE_CLUSTERS: SourceCluster[] = [
  {
    clusterId: 'cl.powell.remarks',
    title: 'Powell remarks — scheduled + previews',
    firstObservedAt: hoursAgo(6),
    lastObservedAt: minutesAgo(11),
    itemIds: ['it.001', 'it.002', 'it.003'],
    sourceCount: 3,
    itemCount: 3,
    highestSourceTier: 'primary',
    verificationTier: 'scheduled',
    priorityTier: 'P1',
    urgencyLabel: 'soon',
    priorityReason: 'scheduled macro + multiple source previews (deterministic)',
    tags: [
      {
        tagId: 't.macro.powell.cluster',
        tagType: 'macro',
        tagValue: 'Powell',
        provenance: 'deterministic',
      },
      {
        tagId: 't.topic.cb.cluster',
        tagType: 'topic',
        tagValue: 'central-bank',
        provenance: 'deterministic',
      },
    ],
  },
  {
    clusterId: 'cl.cpi.release',
    title: 'CPI release — scheduled + preview',
    firstObservedAt: hoursAgo(20),
    lastObservedAt: hoursAgo(3),
    itemIds: ['it.004', 'it.005'],
    sourceCount: 2,
    itemCount: 2,
    highestSourceTier: 'primary',
    verificationTier: 'scheduled',
    priorityTier: 'P2',
    urgencyLabel: 'today',
    priorityReason: 'scheduled macro keyword match (deterministic)',
    tags: [
      {
        tagId: 't.macro.cpi.cluster',
        tagType: 'macro',
        tagValue: 'CPI',
        provenance: 'deterministic',
      },
      {
        tagId: 't.topic.infl.cluster',
        tagType: 'topic',
        tagValue: 'inflation',
        provenance: 'deterministic',
      },
    ],
  },
  {
    clusterId: 'cl.me.geo',
    title: 'Middle East geopolitical cluster',
    firstObservedAt: hoursAgo(2),
    lastObservedAt: minutesAgo(57),
    itemIds: ['it.006', 'it.007', 'it.008', 'it.009'],
    sourceCount: 4,
    itemCount: 4,
    highestSourceTier: 'reputable',
    verificationTier: 'reported',
    priorityTier: 'P1',
    urgencyLabel: 'soon',
    priorityReason: 'duplicate cluster across multiple reputable sources (deterministic)',
    tags: [
      {
        tagId: 't.region.me.cluster',
        tagType: 'region',
        tagValue: 'middle-east',
        provenance: 'deterministic',
      },
      {
        tagId: 't.asset.gold.cluster',
        tagType: 'asset',
        tagValue: 'Gold',
        provenance: 'deterministic',
      },
      {
        tagId: 't.asset.oil.cluster',
        tagType: 'asset',
        tagValue: 'Oil',
        provenance: 'deterministic',
      },
    ],
  },
  {
    clusterId: 'cl.spx.earnings',
    title: 'SPX earnings cluster',
    firstObservedAt: minutesAgo(20),
    lastObservedAt: minutesAgo(10),
    itemIds: ['it.010', 'it.011', 'it.012'],
    sourceCount: 3,
    itemCount: 3,
    highestSourceTier: 'primary',
    verificationTier: 'reported',
    priorityTier: 'P2',
    urgencyLabel: 'today',
    priorityReason: 'multi-source earnings cluster (deterministic)',
    tags: [
      {
        tagId: 't.asset.spx.cluster',
        tagType: 'asset',
        tagValue: 'SPX',
        provenance: 'deterministic',
      },
      {
        tagId: 't.topic.earn.cluster',
        tagType: 'topic',
        tagValue: 'earnings',
        provenance: 'deterministic',
      },
    ],
  },
];
