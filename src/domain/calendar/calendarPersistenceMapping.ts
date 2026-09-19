import type { RawSourcePayload } from '../ingestion/types';
import type { AppendRecordInput } from '../persistence';
import type {
  CalendarConfirmation,
  CalendarEventRevision,
  CalendarIngestionRun,
  CalendarMalformedRecord,
  CalendarSourceSnapshot,
} from './types';
import type { CalendarSupersessionEvent } from './calendarSupersessionEvents';
import {
  CALENDAR_CONFIRMATIONS_STREAM,
  CALENDAR_CONFIRMATION_SCHEMA_VERSION,
  CALENDAR_MALFORMED_RECORDS_STREAM,
  CALENDAR_MALFORMED_SCHEMA_VERSION,
  CALENDAR_PERSISTENCE_PRODUCER_VERSION,
  CALENDAR_PERSISTENCE_SOURCE_PHASE,
  CALENDAR_RAW_PAYLOADS_STREAM,
  CALENDAR_RAW_PAYLOAD_SCHEMA_VERSION,
  CALENDAR_REVISIONS_STREAM,
  CALENDAR_REVISION_SCHEMA_VERSION,
  CALENDAR_RUNS_STREAM,
  CALENDAR_RUN_SCHEMA_VERSION,
  CALENDAR_SNAPSHOTS_STREAM,
  CALENDAR_SNAPSHOT_SCHEMA_VERSION,
  CALENDAR_SUPERSESSION_EVENTS_STREAM,
  CALENDAR_SUPERSESSION_SCHEMA_VERSION,
} from './calendarPersistenceStreams';

export const calendarRawPayloadRecordId = (
  streamSequence: number,
  record: RawSourcePayload,
): string => `calendar-raw-payload:${streamSequence}:${record.rawPayloadId}`;

export const calendarSnapshotRecordId = (
  streamSequence: number,
  record: CalendarSourceSnapshot,
): string => `calendar-snapshot:${streamSequence}:${record.snapshotId}`;

export const calendarRevisionRecordId = (
  streamSequence: number,
  record: CalendarEventRevision,
): string =>
  `calendar-revision:${streamSequence}:${record.canonicalEventKey}:${record.revisionNumber}`;

export const calendarConfirmationRecordId = (
  streamSequence: number,
  record: CalendarConfirmation,
): string => `calendar-confirmation:${streamSequence}:${record.confirmationId}`;

export const calendarMalformedRecordId = (
  streamSequence: number,
  record: CalendarMalformedRecord,
): string => `calendar-malformed:${streamSequence}:${record.malformedCalendarRecordId}`;

export const calendarRunRecordId = (streamSequence: number, record: CalendarIngestionRun): string =>
  `calendar-run:${streamSequence}:${record.ingestionRunId}`;

export const calendarSupersessionRecordId = (
  streamSequence: number,
  record: CalendarSupersessionEvent,
): string =>
  `calendar-supersession:${streamSequence}:${record.supersededRevisionId}:${record.supersedingRevisionId}:${record.reason}`;

export const mapRawPayloadToInput = (
  record: RawSourcePayload,
  streamSequence: number,
): AppendRecordInput<RawSourcePayload> => ({
  recordId: calendarRawPayloadRecordId(streamSequence, record),
  streamName: CALENDAR_RAW_PAYLOADS_STREAM,
  streamKey: record.sourceId,
  recordedAt: record.observedAt,
  schemaVersion: CALENDAR_RAW_PAYLOAD_SCHEMA_VERSION,
  producerVersion: CALENDAR_PERSISTENCE_PRODUCER_VERSION,
  sourcePhase: CALENDAR_PERSISTENCE_SOURCE_PHASE,
  ...(record.failureReason !== undefined ? { reason: record.failureReason } : {}),
  payload: record,
});

export const mapSnapshotToInput = (
  record: CalendarSourceSnapshot,
  streamSequence: number,
): AppendRecordInput<CalendarSourceSnapshot> => ({
  recordId: calendarSnapshotRecordId(streamSequence, record),
  streamName: CALENDAR_SNAPSHOTS_STREAM,
  streamKey: record.sourceId,
  recordedAt: record.observedAt,
  schemaVersion: CALENDAR_SNAPSHOT_SCHEMA_VERSION,
  producerVersion: CALENDAR_PERSISTENCE_PRODUCER_VERSION,
  sourcePhase: CALENDAR_PERSISTENCE_SOURCE_PHASE,
  payload: record,
});

export const mapRevisionToInput = (
  record: CalendarEventRevision,
  streamSequence: number,
): AppendRecordInput<CalendarEventRevision> => ({
  recordId: calendarRevisionRecordId(streamSequence, record),
  streamName: CALENDAR_REVISIONS_STREAM,
  streamKey: record.sourceId,

  recordedAt: record.observedAt,
  schemaVersion: CALENDAR_REVISION_SCHEMA_VERSION,
  producerVersion: CALENDAR_PERSISTENCE_PRODUCER_VERSION,
  sourcePhase: CALENDAR_PERSISTENCE_SOURCE_PHASE,
  reason: record.changeReason,
  payload: record,
});

export const mapConfirmationToInput = (
  record: CalendarConfirmation,
  streamSequence: number,
): AppendRecordInput<CalendarConfirmation> => ({
  recordId: calendarConfirmationRecordId(streamSequence, record),
  streamName: CALENDAR_CONFIRMATIONS_STREAM,
  streamKey: record.sourceId,
  recordedAt: record.confirmedAt,
  schemaVersion: CALENDAR_CONFIRMATION_SCHEMA_VERSION,
  producerVersion: CALENDAR_PERSISTENCE_PRODUCER_VERSION,
  sourcePhase: CALENDAR_PERSISTENCE_SOURCE_PHASE,
  payload: record,
});

export const mapMalformedToInput = (
  record: CalendarMalformedRecord,
  streamSequence: number,
): AppendRecordInput<CalendarMalformedRecord> => ({
  recordId: calendarMalformedRecordId(streamSequence, record),
  streamName: CALENDAR_MALFORMED_RECORDS_STREAM,
  streamKey: record.sourceId,
  recordedAt: record.quarantinedAt,
  schemaVersion: CALENDAR_MALFORMED_SCHEMA_VERSION,
  producerVersion: CALENDAR_PERSISTENCE_PRODUCER_VERSION,
  sourcePhase: CALENDAR_PERSISTENCE_SOURCE_PHASE,
  reason: record.reason,
  payload: record,
});

export const mapRunToInput = (
  record: CalendarIngestionRun,
  streamSequence: number,
): AppendRecordInput<CalendarIngestionRun> => ({
  recordId: calendarRunRecordId(streamSequence, record),
  streamName: CALENDAR_RUNS_STREAM,
  streamKey: record.sourceId,
  recordedAt: record.finishedAt,
  schemaVersion: CALENDAR_RUN_SCHEMA_VERSION,
  producerVersion: CALENDAR_PERSISTENCE_PRODUCER_VERSION,
  sourcePhase: CALENDAR_PERSISTENCE_SOURCE_PHASE,
  ...(record.failureReason !== undefined ? { reason: record.failureReason } : {}),
  payload: record,
});

export const mapSupersessionToInput = (
  record: CalendarSupersessionEvent,
  streamSequence: number,
): AppendRecordInput<CalendarSupersessionEvent> => ({
  recordId: calendarSupersessionRecordId(streamSequence, record),
  streamName: CALENDAR_SUPERSESSION_EVENTS_STREAM,
  streamKey: record.sourceId,

  recordedAt: record.observedAt,
  schemaVersion: CALENDAR_SUPERSESSION_SCHEMA_VERSION,
  producerVersion: CALENDAR_PERSISTENCE_PRODUCER_VERSION,
  sourcePhase: CALENDAR_PERSISTENCE_SOURCE_PHASE,
  reason: record.reason,
  payload: record,
});
