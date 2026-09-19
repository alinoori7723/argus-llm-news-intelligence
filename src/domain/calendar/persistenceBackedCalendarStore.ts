import { deepClone, deepFreeze, type AppendOnlyPersistenceStore } from '../persistence';
import type { RawSourcePayload } from '../ingestion/types';
import type {
  CalendarConfirmation,
  CalendarEventRevision,
  CalendarIngestionRun,
  CalendarMalformedRecord,
  CalendarSourceSnapshot,
} from './types';
import type { CalendarStore } from './store';
import {
  applySupersessionEvents,
  type CalendarSupersessionEvent,
} from './calendarSupersessionEvents';
import {
  mapConfirmationToInput,
  mapMalformedToInput,
  mapRawPayloadToInput,
  mapRevisionToInput,
  mapRunToInput,
  mapSnapshotToInput,
  mapSupersessionToInput,
} from './calendarPersistenceMapping';
import {
  CALENDAR_CONFIRMATIONS_STREAM,
  CALENDAR_MALFORMED_RECORDS_STREAM,
  CALENDAR_RAW_PAYLOADS_STREAM,
  CALENDAR_REVISIONS_STREAM,
  CALENDAR_RUNS_STREAM,
  CALENDAR_SNAPSHOTS_STREAM,
  CALENDAR_SUPERSESSION_EVENTS_STREAM,
} from './calendarPersistenceStreams';

export class PersistenceBackedCalendarStore implements CalendarStore {
  private seq = 0;

  constructor(private readonly store: AppendOnlyPersistenceStore) {}

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  appendRawPayload(p: RawSourcePayload): void {
    const s = this.store.readStream(CALENDAR_RAW_PAYLOADS_STREAM).length;
    this.store.append(mapRawPayloadToInput(p, s));
  }
  appendSnapshot(snapshot: CalendarSourceSnapshot): void {
    const s = this.store.readStream(CALENDAR_SNAPSHOTS_STREAM).length;
    this.store.append(mapSnapshotToInput(snapshot, s));
  }
  appendRevision(r: CalendarEventRevision): void {
    const s = this.store.readStream(CALENDAR_REVISIONS_STREAM).length;
    this.store.append(mapRevisionToInput(r, s));
  }
  appendConfirmation(c: CalendarConfirmation): void {
    const s = this.store.readStream(CALENDAR_CONFIRMATIONS_STREAM).length;
    this.store.append(mapConfirmationToInput(c, s));
  }
  appendMalformedRecords(records: CalendarMalformedRecord[]): void {
    if (records.length === 0) return;

    const base = this.store.readStream(CALENDAR_MALFORMED_RECORDS_STREAM).length;
    this.store.appendBatch(records.map((m, i) => mapMalformedToInput(m, base + i)));
  }
  recordRun(run: CalendarIngestionRun): void {
    const s = this.store.readStream(CALENDAR_RUNS_STREAM).length;
    this.store.append(mapRunToInput(run, s));
  }
  appendSupersession(event: CalendarSupersessionEvent): void {
    const s = this.store.readStream(CALENDAR_SUPERSESSION_EVENTS_STREAM).length;
    this.store.append(mapSupersessionToInput(event, s));
  }

  private read<T>(streamName: string): T[] {
    return this.store.readStream(streamName).map((r) => deepFreeze(deepClone(r.payload)) as T);
  }

  private rawRevisions(): CalendarEventRevision[] {
    return this.read<CalendarEventRevision>(CALENDAR_REVISIONS_STREAM);
  }

  get rawPayloads(): readonly RawSourcePayload[] {
    return Object.freeze(this.read<RawSourcePayload>(CALENDAR_RAW_PAYLOADS_STREAM));
  }
  get snapshots(): readonly CalendarSourceSnapshot[] {
    return Object.freeze(this.read<CalendarSourceSnapshot>(CALENDAR_SNAPSHOTS_STREAM));
  }
  get confirmations(): readonly CalendarConfirmation[] {
    return Object.freeze(this.read<CalendarConfirmation>(CALENDAR_CONFIRMATIONS_STREAM));
  }
  get malformedRecords(): readonly CalendarMalformedRecord[] {
    return Object.freeze(this.read<CalendarMalformedRecord>(CALENDAR_MALFORMED_RECORDS_STREAM));
  }
  get runs(): readonly CalendarIngestionRun[] {
    return Object.freeze(this.read<CalendarIngestionRun>(CALENDAR_RUNS_STREAM));
  }
  get supersessionEvents(): readonly CalendarSupersessionEvent[] {
    return Object.freeze(this.read<CalendarSupersessionEvent>(CALENDAR_SUPERSESSION_EVENTS_STREAM));
  }

  get revisions(): readonly CalendarEventRevision[] {
    return Object.freeze(
      applySupersessionEvents(this.rawRevisions(), this.supersessionEvents).map((r) =>
        deepFreeze(r),
      ),
    );
  }

  revisionsForEvent(sourceId: string, sourceEventId: string): readonly CalendarEventRevision[] {
    return Object.freeze(
      this.revisions.filter((r) => r.sourceId === sourceId && r.sourceEventId === sourceEventId),
    );
  }

  currentRevisionFor(sourceId: string, sourceEventId: string): CalendarEventRevision | undefined {
    let current: CalendarEventRevision | undefined;
    for (const r of this.revisions) {
      if (
        r.sourceId === sourceId &&
        r.sourceEventId === sourceEventId &&
        r.supersededByRevisionId === undefined
      ) {
        if (!current || r.revisionNumber > current.revisionNumber) current = r;
      }
    }
    return current;
  }

  maxRevisionNumberFor(sourceId: string, sourceEventId: string): number {
    return this.rawRevisions()
      .filter((r) => r.sourceId === sourceId && r.sourceEventId === sourceEventId)
      .reduce((max, r) => Math.max(max, r.revisionNumber), 0);
  }
}
