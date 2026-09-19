import {
  confirmedClusters,
  correctionEventsFor,
  membershipReasonFor,
  type ClusterStore,
} from '@/domain/clustering';
import { buildConfirmedClusterDisplay, type ConfirmedClusterDisplay } from '@/domain/display';
import { deepFreeze } from '@/domain/persistence';
import { buildClusterScenario } from './clusterScenario';

export interface ClusterMemberView {
  itemId: string;
  sourceId: string;
  reasonType: string;
  evidence?: string;
}

export interface ClusterCorrectionView {
  membershipEventId: string;
  itemId: string;
  reasonDetail: string;
}

export interface ClusterCardView {
  clusterId: string;
  clusterTitle: string;
  clusterStatus: string;

  display: ConfirmedClusterDisplay | null;
  members: ClusterMemberView[];
  corrections: ClusterCorrectionView[];
}

export interface UnmergedView {
  itemId: string;
  sourceId: string;
}

export interface ClustersPageView {
  clusters: readonly ClusterCardView[];
  unmerged: readonly UnmergedView[];
}

const buildClustersPageView = (): ClustersPageView => {
  const { store, identityById, identities } = buildClusterScenario();
  const s: ClusterStore = store;

  const clusters: ClusterCardView[] = confirmedClusters(s, identityById).map((c) => {
    const corrections = correctionEventsFor(s, c.clusterId);
    const display = buildConfirmedClusterDisplay(c, {
      correctionCount: corrections.length,
    });
    const members: ClusterMemberView[] = c.confirmedMemberItemIds.map((itemId) => {
      const reason = membershipReasonFor(s, c.clusterId, itemId);
      return {
        itemId,
        sourceId: identityById[itemId]?.sourceId ?? '',
        reasonType: reason?.reasonType ?? 'unknown',
        evidence: reason?.evidence,
      };
    });
    const corrViews: ClusterCorrectionView[] = corrections.map((e) => ({
      membershipEventId: e.membershipEventId,
      itemId: e.itemId,
      reasonDetail: e.reasonDetail,
    }));
    return {
      clusterId: c.clusterId,
      clusterTitle: c.clusterTitle,
      clusterStatus: c.clusterStatus,
      display,
      members,
      corrections: corrViews,
    };
  });

  const unmerged: UnmergedView[] = identities
    .filter((i) => s.currentClusterIdForItem(i.itemId) === undefined)
    .map((i) => ({ itemId: i.itemId, sourceId: i.sourceId }));

  return { clusters, unmerged };
};

export const CLUSTERS_PAGE_VIEW: ClustersPageView = deepFreeze(buildClustersPageView());
