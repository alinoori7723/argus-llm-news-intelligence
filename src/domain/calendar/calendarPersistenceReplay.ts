import { deepClone, deepFreeze, type PersistedRecord } from '../persistence';
import type { RawSourcePayload } from '../ingestion/types';
import type {
  CalendarConfirmation,
  CalendarEventRevision,
  CalendarIngestionRun,
  CalendarMalformedRecord,
  CalendarSourceSnapshot,
} from './types';
import {
  applySupersessionEvents,
  validateSupersessionReferences,
  type CalendarSupersessionEvent,
} from './calendarSupersessionEvents';
import {
  CALENDAR_CONFIRMATIONS_STREAM,
  CALENDAR_MALFORMED_RECORDS_STREAM,
  CALENDAR_RAW_PAYLOADS_STREAM,
  CALENDAR_REVISIONS_STREAM,
  CALENDAR_RUNS_STREAM,
  CALENDAR_SNAPSHOTS_STREAM,
  CALENDAR_SUPERSESSION_EVENTS_STREAM,
  calendarStreamOrderIndex,
  isCalendarStreamName,
} from './calendarPersistenceStreams';

export interface CalendarPersistenceSnapshot {
  readonly rawPayloads: readonly RawSourcePayload[];
  readonly snapshots: readonly CalendarSourceSnapshot[];

  readonly revisions: readonly CalendarEventRevision[];
  readonly confirmations: readonly CalendarConfirmation[];
  readonly malformedRecords: readonly CalendarMalformedRecord[];
  readonly runs: readonly CalendarIngestionRun[];
  readonly supersessionEvents: readonly CalendarSupersessionEvent[];
}

export const compareCalendarRecordsGlobally = (a: PersistedRecord, b: PersistedRecord): number => {
  if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? -1 : 1;
  const sa = calendarStreamOrderIndex(a.streamName);
  const sb = calendarStreamOrderIndex(b.streamName);
  if (sa !== sb) return sa - sb;
  if (a.sequence !== b.sequence) return a.sequence - b.sequence;
  if (a.recordId !== b.recordId) return a.recordId < b.recordId ? -1 : 1;
  return 0;
};

export const orderCalendarRecordsGlobally = (
  records: readonly PersistedRecord[],
): PersistedRecord[] => [...records].sort(compareCalendarRecordsGlobally);

export const buildCalendarSnapshot = (
  records: readonly PersistedRecord[],
): CalendarPersistenceSnapshot => {
  const seenIds = new Set<string>();
  const byStream = new Map<string, PersistedRecord[]>();

  for (const record of records) {
    if (!isCalendarStreamName(record.streamName)) continue;
    if (seenIds.has(record.recordId)) {
      throw new Error(`calendar replay: duplicate recordId "${record.recordId}" in history`);
    }
    seenIds.add(record.recordId);
    const list = byStream.get(record.streamName) ?? [];
    list.push(record);
    byStream.set(record.streamName, list);
  }

  for (const [streamName, list] of byStream) {
    const sequences = list.map((r) => r.sequence).sort((x, y) => x - y);
    sequences.forEach((seq, i) => {
      if (seq !== i) {
        throw new Error(
          `calendar replay: stream "${streamName}" has non-contiguous sequence ` +
            `(expected ${i}, got ${seq})`,
        );
      }
    });
  }

  const orderedPayloads = <T>(streamName: string): T[] =>
    (byStream.get(streamName) ?? [])
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((r) => deepFreeze(deepClone(r.payload)) as T);

  return deepFreeze({
    rawPayloads: Object.freeze(orderedPayloads<RawSourcePayload>(CALENDAR_RAW_PAYLOADS_STREAM)),
    snapshots: Object.freeze(orderedPayloads<CalendarSourceSnapshot>(CALENDAR_SNAPSHOTS_STREAM)),
    revisions: Object.freeze(orderedPayloads<CalendarEventRevision>(CALENDAR_REVISIONS_STREAM)),
    confirmations: Object.freeze(
      orderedPayloads<CalendarConfirmation>(CALENDAR_CONFIRMATIONS_STREAM),
    ),
    malformedRecords: Object.freeze(
      orderedPayloads<CalendarMalformedRecord>(CALENDAR_MALFORMED_RECORDS_STREAM),
    ),
    runs: Object.freeze(orderedPayloads<CalendarIngestionRun>(CALENDAR_RUNS_STREAM)),
    supersessionEvents: Object.freeze(
      orderedPayloads<CalendarSupersessionEvent>(CALENDAR_SUPERSESSION_EVENTS_STREAM),
    ),
  });
};

export const replayCalendarHistory = (
  records: readonly PersistedRecord[],
): CalendarPersistenceSnapshot => {
  for (const record of records) {
    if (!isCalendarStreamName(record.streamName)) {
      throw new Error(
        `calendar replay: unknown stream "${record.streamName}" is not a calendar ` +
          `stream (expected one of calendar-raw-payloads / calendar-snapshots / ` +
          `calendar-revisions / calendar-confirmations / calendar-malformed-records / ` +
          `calendar-runs / calendar-supersession-events)`,
      );
    }
  }
  const snapshot = buildCalendarSnapshot(records);
  const refCheck = validateSupersessionReferences(snapshot.revisions, snapshot.supersessionEvents);
  if (!refCheck.ok) {
    throw new Error(
      `calendar replay: unresolved supersession reference(s) ` +
        `[${refCheck.unresolvedEventIds.join(', ')}]`,
    );
  }

  applySupersessionEvents(snapshot.revisions, snapshot.supersessionEvents);
  return snapshot;
};

export const deriveCalendarRevisions = (
  snapshot: CalendarPersistenceSnapshot,
): readonly CalendarEventRevision[] =>
  Object.freeze(
    applySupersessionEvents(snapshot.revisions, snapshot.supersessionEvents).map((r) =>
      deepFreeze(r),
    ),
  );

export const currentCalendarRevisions = (
  snapshot: CalendarPersistenceSnapshot,
): readonly CalendarEventRevision[] =>
  Object.freeze(
    deriveCalendarRevisions(snapshot).filter((r) => r.supersededByRevisionId === undefined),
  );
