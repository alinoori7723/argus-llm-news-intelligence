import type { AppendRecordInput } from '../persistence';
import type {
  IngestionRun,
  MalformedSourceItem,
  NormalizedIngestedItem,
  RawSourcePayload,
} from './types';
import {
  INGESTION_MALFORMED_ITEMS_STREAM,
  INGESTION_MALFORMED_ITEM_SCHEMA_VERSION,
  INGESTION_NORMALIZED_ITEMS_STREAM,
  INGESTION_NORMALIZED_ITEM_SCHEMA_VERSION,
  INGESTION_PERSISTENCE_PRODUCER_VERSION,
  INGESTION_PERSISTENCE_SOURCE_PHASE,
  INGESTION_RAW_PAYLOADS_STREAM,
  INGESTION_RAW_PAYLOAD_SCHEMA_VERSION,
  INGESTION_RUNS_STREAM,
  INGESTION_RUN_SCHEMA_VERSION,
} from './ingestionPersistenceStreams';

const RAW_PAYLOAD_ID_PREFIX = 'ingestion-raw-payload';
const NORMALIZED_ITEM_ID_PREFIX = 'ingestion-normalized-item';
const MALFORMED_ITEM_ID_PREFIX = 'ingestion-malformed-item';
const RUN_ID_PREFIX = 'ingestion-run';

export const rawPayloadRecordId = (streamSequence: number, record: RawSourcePayload): string =>
  `${RAW_PAYLOAD_ID_PREFIX}:${streamSequence}:${record.rawPayloadId}`;

export const normalizedItemRecordId = (
  streamSequence: number,
  record: NormalizedIngestedItem,
): string => `${NORMALIZED_ITEM_ID_PREFIX}:${streamSequence}:${record.itemId}`;

export const malformedItemRecordId = (
  streamSequence: number,
  record: MalformedSourceItem,
): string => `${MALFORMED_ITEM_ID_PREFIX}:${streamSequence}:${record.malformedItemId}`;

export const ingestionRunRecordId = (streamSequence: number, record: IngestionRun): string =>
  `${RUN_ID_PREFIX}:${streamSequence}:${record.ingestionRunId}`;

export const mapRawPayloadToInput = (
  record: RawSourcePayload,
  streamSequence: number,
): AppendRecordInput<RawSourcePayload> => ({
  recordId: rawPayloadRecordId(streamSequence, record),
  streamName: INGESTION_RAW_PAYLOADS_STREAM,
  streamKey: record.sourceId,

  recordedAt: record.observedAt,
  schemaVersion: INGESTION_RAW_PAYLOAD_SCHEMA_VERSION,
  producerVersion: INGESTION_PERSISTENCE_PRODUCER_VERSION,
  sourcePhase: INGESTION_PERSISTENCE_SOURCE_PHASE,
  ...(record.failureReason !== undefined ? { reason: record.failureReason } : {}),
  payload: record,
});

export const mapNormalizedItemToInput = (
  record: NormalizedIngestedItem,
  streamSequence: number,
): AppendRecordInput<NormalizedIngestedItem> => ({
  recordId: normalizedItemRecordId(streamSequence, record),
  streamName: INGESTION_NORMALIZED_ITEMS_STREAM,
  streamKey: record.sourceId,

  recordedAt: record.normalizedAt,
  schemaVersion: INGESTION_NORMALIZED_ITEM_SCHEMA_VERSION,
  producerVersion: INGESTION_PERSISTENCE_PRODUCER_VERSION,
  sourcePhase: INGESTION_PERSISTENCE_SOURCE_PHASE,
  payload: record,
});

export const mapMalformedItemToInput = (
  record: MalformedSourceItem,
  streamSequence: number,
): AppendRecordInput<MalformedSourceItem> => ({
  recordId: malformedItemRecordId(streamSequence, record),
  streamName: INGESTION_MALFORMED_ITEMS_STREAM,
  streamKey: record.sourceId,

  recordedAt: record.quarantinedAt,
  schemaVersion: INGESTION_MALFORMED_ITEM_SCHEMA_VERSION,
  producerVersion: INGESTION_PERSISTENCE_PRODUCER_VERSION,
  sourcePhase: INGESTION_PERSISTENCE_SOURCE_PHASE,
  reason: record.reason,
  payload: record,
});

export const mapRunToInput = (
  record: IngestionRun,
  streamSequence: number,
): AppendRecordInput<IngestionRun> => ({
  recordId: ingestionRunRecordId(streamSequence, record),
  streamName: INGESTION_RUNS_STREAM,
  streamKey: record.sourceId,

  recordedAt: record.finishedAt,
  schemaVersion: INGESTION_RUN_SCHEMA_VERSION,
  producerVersion: INGESTION_PERSISTENCE_PRODUCER_VERSION,
  sourcePhase: INGESTION_PERSISTENCE_SOURCE_PHASE,
  ...(record.failureReason !== undefined ? { reason: record.failureReason } : {}),
  payload: record,
});
