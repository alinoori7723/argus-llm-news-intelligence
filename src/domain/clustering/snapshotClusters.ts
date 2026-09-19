import type { ExternalItem } from '../types';
import type { Clock } from '../ingestion/types';
import { InMemoryAppendOnlyPersistenceStore } from '../persistence';
import { toCanonicalIdentity } from './canonicalIdentity';
import type { ClusterStore } from './store';
import { PersistenceBackedClusterStore } from './persistenceBackedClusterStore';
import { ConfirmedClusterEngine } from './clusterBuilder';
import { confirmedClusterForItem, confirmedClusters, identityIndex } from './selectors';
import type { ConfirmedCluster } from './types';

export interface SnapshotClusterView {
  clusters: ConfirmedCluster[];
  store: ClusterStore;
  forItem: (itemId: string) => ConfirmedCluster | undefined;
}

export const buildConfirmedClustersFromItems = (
  items: ExternalItem[],
  clock: Clock,
): SnapshotClusterView => {
  const sorted = [...items].sort((a, b) => (a.itemId < b.itemId ? -1 : 1));
  const identities = sorted.map(toCanonicalIdentity);

  const store = new PersistenceBackedClusterStore(new InMemoryAppendOnlyPersistenceStore());
  const engine = new ConfirmedClusterEngine(store, clock);
  engine.addAll(identities);
  const clusters = confirmedClusters(store, identityIndex(identities));
  return {
    clusters,
    store,
    forItem: (itemId) => confirmedClusterForItem(clusters, itemId),
  };
};
