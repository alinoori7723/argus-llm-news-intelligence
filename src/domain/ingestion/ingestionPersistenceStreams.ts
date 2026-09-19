export const INGESTION_RAW_PAYLOADS_STREAM = 'ingestion-raw-payloads';

export const INGESTION_NORMALIZED_ITEMS_STREAM = 'ingestion-normalized-items';

export const INGESTION_MALFORMED_ITEMS_STREAM = 'ingestion-malformed-items';

export const INGESTION_RUNS_STREAM = 'ingestion-runs';

export type IngestionPersistenceStreamName =
  | typeof INGESTION_RAW_PAYLOADS_STREAM
  | typeof INGESTION_NORMALIZED_ITEMS_STREAM
  | typeof INGESTION_MALFORMED_ITEMS_STREAM
  | typeof INGESTION_RUNS_STREAM;

export const INGESTION_STREAM_ORDER: readonly IngestionPersistenceStreamName[] = [
  INGESTION_RAW_PAYLOADS_STREAM,
  INGESTION_NORMALIZED_ITEMS_STREAM,
  INGESTION_MALFORMED_ITEMS_STREAM,
  INGESTION_RUNS_STREAM,
];

export const INGESTION_STREAM_NAMES: ReadonlySet<string> = new Set(INGESTION_STREAM_ORDER);

export const ingestionStreamOrderIndex = (streamName: string): number => {
  const i = INGESTION_STREAM_ORDER.indexOf(streamName as IngestionPersistenceStreamName);
  return i === -1 ? INGESTION_STREAM_ORDER.length : i;
};

export const isIngestionStreamName = (
  streamName: string,
): streamName is IngestionPersistenceStreamName => INGESTION_STREAM_NAMES.has(streamName);

export const INGESTION_PERSISTENCE_PRODUCER_VERSION = 'ingestion-persistence-v1';

export const INGESTION_PERSISTENCE_SOURCE_PHASE = 'phase-2-15';

export const INGESTION_RAW_PAYLOAD_SCHEMA_VERSION = 'ingestion-raw-payload-v1';
export const INGESTION_NORMALIZED_ITEM_SCHEMA_VERSION = 'ingestion-normalized-item-v1';
export const INGESTION_MALFORMED_ITEM_SCHEMA_VERSION = 'ingestion-malformed-item-v1';
export const INGESTION_RUN_SCHEMA_VERSION = 'ingestion-run-v1';
