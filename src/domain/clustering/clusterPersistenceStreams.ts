export const CLUSTER_MEMBERSHIP_EVENTS_STREAM = 'cluster-membership-events';

export const CLUSTER_DEDUPE_DECISIONS_STREAM = 'cluster-dedupe-decisions';

export type ClusterPersistenceStreamName =
  | typeof CLUSTER_MEMBERSHIP_EVENTS_STREAM
  | typeof CLUSTER_DEDUPE_DECISIONS_STREAM;

export const CLUSTER_STREAM_ORDER: readonly ClusterPersistenceStreamName[] = [
  CLUSTER_MEMBERSHIP_EVENTS_STREAM,
  CLUSTER_DEDUPE_DECISIONS_STREAM,
];

export const CLUSTER_STREAM_NAMES: ReadonlySet<string> = new Set(CLUSTER_STREAM_ORDER);

export const clusterStreamOrderIndex = (streamName: string): number => {
  const i = CLUSTER_STREAM_ORDER.indexOf(streamName as ClusterPersistenceStreamName);
  return i === -1 ? CLUSTER_STREAM_ORDER.length : i;
};

export const isClusterStreamName = (
  streamName: string,
): streamName is ClusterPersistenceStreamName => CLUSTER_STREAM_NAMES.has(streamName);

export const CLUSTER_PERSISTENCE_PRODUCER_VERSION = 'cluster-persistence-v1';

export const CLUSTER_PERSISTENCE_SOURCE_PHASE = 'phase-2-17';

export const CLUSTER_MEMBERSHIP_EVENT_SCHEMA_VERSION = 'cluster-membership-event-v1';
export const CLUSTER_DEDUPE_DECISION_SCHEMA_VERSION = 'cluster-dedupe-decision-v1';
