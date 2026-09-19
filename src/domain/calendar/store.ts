import type { RawSourcePayload } from '../ingestion/types';
import type {
  CalendarConfirmation,
  CalendarEventRevision,
  CalendarIngestionRun,
  CalendarMalformedRecord,
  CalendarSourceSnapshot,
} from './types';
import type { CalendarSupersessionEvent } from './calendarSupersessionEvents';

export interface CalendarStore {
  nextId(prefix: string): string;
  appendRawPayload(payload: RawSourcePayload): void;
  appendSnapshot(snapshot: CalendarSourceSnapshot): void;
  appendRevision(revision: CalendarEventRevision): void;
  appendConfirmation(confirmation: CalendarConfirmation): void;
  appendMalformedRecords(records: CalendarMalformedRecord[]): void;
  recordRun(run: CalendarIngestionRun): void;

  appendSupersession(event: CalendarSupersessionEvent): void;

  currentRevisionFor(sourceId: string, sourceEventId: string): CalendarEventRevision | undefined;

  maxRevisionNumberFor(sourceId: string, sourceEventId: string): number;
  readonly rawPayloads: readonly RawSourcePayload[];
  readonly snapshots: readonly CalendarSourceSnapshot[];

  readonly revisions: readonly CalendarEventRevision[];
  readonly confirmations: readonly CalendarConfirmation[];
  readonly malformedRecords: readonly CalendarMalformedRecord[];
  readonly runs: readonly CalendarIngestionRun[];
  readonly supersessionEvents: readonly CalendarSupersessionEvent[];
  revisionsForEvent(sourceId: string, sourceEventId: string): readonly CalendarEventRevision[];
}

export class AppendOnlyCalendarStore implements CalendarStore {
  private readonly rawPayloadsList: RawSourcePayload[] = [];
  private readonly snapshotsList: CalendarSourceSnapshot[] = [];
  private readonly revisionsList: CalendarEventRevision[] = [];
  private readonly confirmationsList: CalendarConfirmation[] = [];
  private readonly malformedList: CalendarMalformedRecord[] = [];
  private readonly runsList: CalendarIngestionRun[] = [];
  private readonly supersessionEventsList: CalendarSupersessionEvent[] = [];
  private seq = 0;

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  appendRawPayload(p: RawSourcePayload): void {
    this.rawPayloadsList.push(p);
  }
  appendSnapshot(s: CalendarSourceSnapshot): void {
    this.snapshotsList.push(s);
  }
  appendRevision(r: CalendarEventRevision): void {
    this.revisionsList.push(r);
  }
  appendConfirmation(c: CalendarConfirmation): void {
    this.confirmationsList.push(c);
  }
  appendMalformedRecords(records: CalendarMalformedRecord[]): void {
    this.malformedList.push(...records);
  }
  recordRun(run: CalendarIngestionRun): void {
    this.runsList.push(run);
  }

  appendSupersession(event: CalendarSupersessionEvent): void {
    this.supersessionEventsList.push(event);
    this.markSuperseded(event.supersededRevisionId, event.supersedingRevisionId);
  }

  markSuperseded(revisionId: string, supersededByRevisionId: string): void {
    const prior = this.revisionsList.find((r) => r.revisionId === revisionId);
    if (!prior) return;
    prior.supersededByRevisionId = supersededByRevisionId;
    if (prior.revisionStatus === 'active') {
      prior.revisionStatus = 'superseded';
    }
  }

  currentRevisionFor(sourceId: string, sourceEventId: string): CalendarEventRevision | undefined {
    let current: CalendarEventRevision | undefined;
    for (const r of this.revisionsList) {
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
    return this.revisionsList
      .filter((r) => r.sourceId === sourceId && r.sourceEventId === sourceEventId)
      .reduce((max, r) => Math.max(max, r.revisionNumber), 0);
  }

  get rawPayloads(): readonly RawSourcePayload[] {
    return [...this.rawPayloadsList];
  }
  get snapshots(): readonly CalendarSourceSnapshot[] {
    return [...this.snapshotsList];
  }
  get revisions(): readonly CalendarEventRevision[] {
    return this.revisionsList.map((r) => ({ ...r }));
  }
  get confirmations(): readonly CalendarConfirmation[] {
    return [...this.confirmationsList];
  }
  get malformedRecords(): readonly CalendarMalformedRecord[] {
    return [...this.malformedList];
  }
  get runs(): readonly CalendarIngestionRun[] {
    return [...this.runsList];
  }
  get supersessionEvents(): readonly CalendarSupersessionEvent[] {
    return this.supersessionEventsList.map((e) => ({ ...e }));
  }

  revisionsForEvent(sourceId: string, sourceEventId: string): readonly CalendarEventRevision[] {
    return this.revisionsList
      .filter((r) => r.sourceId === sourceId && r.sourceEventId === sourceEventId)
      .map((r) => ({ ...r }));
  }
}
