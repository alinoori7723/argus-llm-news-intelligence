import type { SourceProfile } from '../types';

export const CALENDAR_PARSER_VERSION = 'calendar-parser-v1';
export const CALENDAR_PROCESSING_VERSION = 'calendar-normalize-v1';

export const CALENDAR_SOURCE_TYPES: ReadonlySet<SourceProfile['sourceType']> = new Set<
  SourceProfile['sourceType']
>(['economic_calendar_fixture']);

export type ImportanceTier = 'high' | 'medium' | 'low' | 'unknown';

export type RevisionStatus =
  | 'active'
  | 'superseded'
  | 'cancelled'
  | 'postponed'
  | 'completed'
  | 'malformed';

export type ChangeReason =
  | 'first_seen'
  | 'time_changed'
  | 'cancelled'
  | 'postponed'
  | 'actual_added'
  | 'forecast_changed'
  | 'metadata_changed'
  | 'unchanged_confirmation'
  | 'malformed';

export type ConfirmationState = 'fresh' | 'aging' | 'stale' | 'unknown';

export type EventStatusHint = 'scheduled' | 'cancelled' | 'postponed' | 'completed';

export interface CalendarEventValues {
  previous?: string;
  forecast?: string;
  actual?: string;
  revised?: string;
}

export interface CalendarParseWarning {
  code: string;
  message: string;
  sourceEventId?: string;
}

export interface CalendarEventIdentity {
  calendarEventId: string;
  sourceId: string;
  sourceEventId: string;
  canonicalEventKey: string;
  country?: string;
  currency?: string;
  eventName: string;
  eventCategory?: string;
}

export interface ParsedCalendarEvent {
  sourceEventId: string;
  canonicalEventKey: string;
  eventName: string;
  country?: string;
  currency?: string;
  eventCategory?: string;
  importanceTier: ImportanceTier;

  scheduledFor: string | null;
  statusHint: EventStatusHint;
  values: CalendarEventValues;
  sourceUrl?: string;
  sourceTimezone?: string;
  rawPayloadId: string;
  parserVersion: string;
  warnings: CalendarParseWarning[];
}

export interface CalendarEventRevision {
  revisionId: string;
  calendarEventId: string;
  sourceId: string;
  sourceEventId: string;
  canonicalEventKey: string;
  revisionNumber: number;
  revisionStatus: RevisionStatus;
  scheduledFor: string | null;
  previousScheduledFor?: string;
  observedAt: string;
  ingestedAt: string;
  normalizedAt: string;

  lastConfirmedAt: string;
  sourceTimezone?: string;
  eventName: string;
  country?: string;
  currency?: string;
  eventCategory?: string;
  importanceTier: ImportanceTier;
  values: CalendarEventValues;
  sourceUrl?: string;
  parserVersion: string;
  processingVersion: string;
  rawPayloadId: string;
  supersedesRevisionId?: string;
  supersededByRevisionId?: string;
  changeReason: ChangeReason;
  warnings: CalendarParseWarning[];
}

export interface CalendarConfirmation {
  confirmationId: string;
  revisionId: string;
  sourceId: string;
  sourceEventId: string;
  confirmedAt: string;
  rawPayloadId: string;
}

export interface CalendarMalformedRecord {
  malformedCalendarRecordId: string;
  sourceId: string;
  rawPayloadId: string;
  reason: string;
  rawSnippet: string;
  parserVersion: string;
  observedAt: string;
  quarantinedAt: string;
}

export interface CalendarSourceSnapshot {
  snapshotId: string;
  sourceId: string;
  observedAt: string;
  rawPayloadId: string;
  parserVersion: string;
  eventCount: number;
  malformedCount: number;
  warningCount: number;
}

export type CalendarIngestionRunStatus = 'skipped' | 'success' | 'partial_success' | 'failed';

export interface CalendarIngestionRun {
  ingestionRunId: string;
  sourceId: string;
  startedAt: string;
  finishedAt: string;
  status: CalendarIngestionRunStatus;
  legalStatusAtRun: SourceProfile['legalStatus'];
  skipReason?: string;
  parserVersion: string;
  processingVersion: string;
  rawPayloadIds: string[];
  createdRevisionIds: string[];
  supersededRevisionIds: string[];
  malformedRecordIds: string[];
  unchangedConfirmationIds: string[];
  warnings: CalendarParseWarning[];
  failureReason?: string;
}
