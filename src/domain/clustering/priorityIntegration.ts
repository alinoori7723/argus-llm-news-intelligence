import { computePriority, type PriorityInputs, type PriorityResult } from '../priority';
import { confirmedClusterForItem } from './selectors';
import { CLUSTER_RULE_VERSION, type ConfirmedCluster } from './types';

export const confirmedClusterSize = (cluster: ConfirmedCluster | undefined): number => {
  if (!cluster) return 1;
  if (cluster.clusterRuleVersion !== CLUSTER_RULE_VERSION) return 1;
  if (cluster.clusterStatus === 'archived') return 1;
  return Math.max(1, cluster.confirmedMemberCount);
};

export const confirmedClusterSizeForItem = (clusters: ConfirmedCluster[], itemId: string): number =>
  confirmedClusterSize(confirmedClusterForItem(clusters, itemId));

export interface ClusteredPriorityInputs {
  item: PriorityInputs['item'];
  source: PriorityInputs['source'];
  now: Date;

  confirmedCluster?: ConfirmedCluster;
}

export const computePriorityForClusteredItem = (input: ClusteredPriorityInputs): PriorityResult => {
  const size = confirmedClusterSize(input.confirmedCluster);
  const result = computePriority({
    item: input.item,
    source: input.source,
    confirmedClusterSize: size,
    now: input.now,
  });
  if (input.confirmedCluster && size > 1) {
    return {
      ...result,
      priorityReason: `${result.priorityReason}; confirmed cluster ${input.confirmedCluster.clusterId} size ${size} (${input.confirmedCluster.clusterRuleVersion})`,
    };
  }
  return result;
};
