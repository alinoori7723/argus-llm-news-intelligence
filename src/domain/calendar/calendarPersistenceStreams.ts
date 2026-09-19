export const CALENDAR_RAW_PAYLOADS_STREAM = 'calendar-raw-payloads';
export const CALENDAR_SNAPSHOTS_STREAM = 'calendar-snapshots';
export const CALENDAR_REVISIONS_STREAM = 'calendar-revisions';
export const CALENDAR_CONFIRMATIONS_STREAM = 'calendar-confirmations';
export const CALENDAR_MALFORMED_RECORDS_STREAM = 'calendar-malformed-records';
export const CALENDAR_RUNS_STREAM = 'calendar-runs';
export const CALENDAR_SUPERSESSION_EVENTS_STREAM = 'calendar-supersession-events';

export type CalendarPersistenceStreamName =
  | typeof CALENDAR_RAW_PAYLOADS_STREAM
  | typeof CALENDAR_SNAPSHOTS_STREAM
  | typeof CALENDAR_REVISIONS_STREAM
  | typeof CALENDAR_CONFIRMATIONS_STREAM
  | typeof CALENDAR_MALFORMED_RECORDS_STREAM
  | typeof CALENDAR_RUNS_STREAM
  | typeof CALENDAR_SUPERSESSION_EVENTS_STREAM;

export const CALENDAR_STREAM_ORDER: readonly CalendarPersistenceStreamName[] = [
  CALENDAR_RAW_PAYLOADS_STREAM,
  CALENDAR_SNAPSHOTS_STREAM,
  CALENDAR_REVISIONS_STREAM,
  CALENDAR_CONFIRMATIONS_STREAM,
  CALENDAR_MALFORMED_RECORDS_STREAM,
  CALENDAR_RUNS_STREAM,
  CALENDAR_SUPERSESSION_EVENTS_STREAM,
];

export const CALENDAR_STREAM_NAMES: ReadonlySet<string> = new Set(CALENDAR_STREAM_ORDER);

export const calendarStreamOrderIndex = (streamName: string): number => {
  const i = CALENDAR_STREAM_ORDER.indexOf(streamName as CalendarPersistenceStreamName);
  return i === -1 ? CALENDAR_STREAM_ORDER.length : i;
};

export const isCalendarStreamName = (
  streamName: string,
): streamName is CalendarPersistenceStreamName => CALENDAR_STREAM_NAMES.has(streamName);

export const CALENDAR_PERSISTENCE_PRODUCER_VERSION = 'calendar-persistence-v1';

export const CALENDAR_PERSISTENCE_SOURCE_PHASE = 'phase-2-16';

export const CALENDAR_RAW_PAYLOAD_SCHEMA_VERSION = 'calendar-raw-payload-v1';
export const CALENDAR_SNAPSHOT_SCHEMA_VERSION = 'calendar-snapshot-v1';
export const CALENDAR_REVISION_SCHEMA_VERSION = 'calendar-revision-v1';
export const CALENDAR_CONFIRMATION_SCHEMA_VERSION = 'calendar-confirmation-v1';
export const CALENDAR_MALFORMED_SCHEMA_VERSION = 'calendar-malformed-record-v1';
export const CALENDAR_RUN_SCHEMA_VERSION = 'calendar-run-v1';
export const CALENDAR_SUPERSESSION_SCHEMA_VERSION = 'calendar-supersession-event-v1';
