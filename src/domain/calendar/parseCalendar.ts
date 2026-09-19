import { sanitizeText } from '../ingestion/sanitize';
import {
  CALENDAR_PARSER_VERSION,
  type CalendarMalformedRecord,
  type CalendarParseWarning,
  type EventStatusHint,
  type ImportanceTier,
  type ParsedCalendarEvent,
} from './types';

export interface ParseCalendarOptions {
  sourceId: string;
  rawPayloadId: string;

  observedAt: string;

  now: Date;
  parserVersion?: string;
}

export interface CalendarParseResult {
  parserVersion: string;
  sourceId: string;
  ok: boolean;
  parsedEvents: ParsedCalendarEvent[];
  malformedRecords: CalendarMalformedRecord[];
  warnings: CalendarParseWarning[];
}

const STATUS_HINTS: ReadonlySet<string> = new Set([
  'scheduled',
  'cancelled',
  'postponed',
  'completed',
]);

const IMPORTANCE_TIERS: ReadonlySet<string> = new Set(['high', 'medium', 'low']);

const asString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

const canonicalKeyFor = (raw: Record<string, unknown>, eventName: string): string => {
  const provided = asString(raw.canonicalEventKey);
  if (provided) return provided;
  const country = asString(raw.country) ?? '?';
  const currency = asString(raw.currency) ?? '?';
  return `${country}|${currency}|${eventName.toLowerCase()}`;
};

export const parseCalendar = (
  payloadText: string,
  opts: ParseCalendarOptions,
): CalendarParseResult => {
  const parserVersion = opts.parserVersion ?? CALENDAR_PARSER_VERSION;
  const quarantinedAt = opts.now.toISOString();
  const base = { parserVersion, sourceId: opts.sourceId };

  let doc: unknown;
  try {
    doc = JSON.parse(payloadText);
  } catch {
    return {
      ...base,
      ok: false,
      parsedEvents: [],
      malformedRecords: [],
      warnings: [{ code: 'malformed_json', message: 'Payload is not valid JSON; parse aborted.' }],
    };
  }

  const events = (doc as { events?: unknown })?.events;
  if (!Array.isArray(events)) {
    return {
      ...base,
      ok: false,
      parsedEvents: [],
      malformedRecords: [],
      warnings: [
        {
          code: 'malformed_structure',
          message: 'Payload has no `events` array; parse aborted.',
        },
      ],
    };
  }

  const parsedEvents: ParsedCalendarEvent[] = [];
  const malformedRecords: CalendarMalformedRecord[] = [];
  const warnings: CalendarParseWarning[] = [];

  events.forEach((rawUnknown, index) => {
    const raw = (rawUnknown ?? {}) as Record<string, unknown>;
    const quarantine = (reason: string) => {
      malformedRecords.push({
        malformedCalendarRecordId: `cal-mal-${opts.rawPayloadId}-${index}`,
        sourceId: opts.sourceId,
        rawPayloadId: opts.rawPayloadId,
        reason,
        rawSnippet: JSON.stringify(raw).slice(0, 240),
        parserVersion,
        observedAt: opts.observedAt,
        quarantinedAt,
      });
      warnings.push({ code: reason, message: `Event ${index} quarantined: ${reason}` });
    };

    const sourceEventId = asString(raw.sourceEventId);
    const canonicalProvided = asString(raw.canonicalEventKey);
    const eventName = sanitizeText(asString(raw.eventName) ?? '');

    if (!sourceEventId && !canonicalProvided) {
      quarantine('missing_identity');
      return;
    }
    if (!eventName) {
      quarantine('missing_event_name');
      return;
    }

    const eventWarnings: CalendarParseWarning[] = [];

    let statusHint: EventStatusHint = 'scheduled';
    const rawStatus = asString(raw.status)?.toLowerCase();
    if (rawStatus && STATUS_HINTS.has(rawStatus)) {
      statusHint = rawStatus as EventStatusHint;
    } else if (rawStatus) {
      eventWarnings.push({
        code: 'invalid_status',
        message: `Unknown status "${rawStatus}"; treated as scheduled.`,
        sourceEventId,
      });
    }

    let importanceTier: ImportanceTier = 'unknown';
    const rawImportance = asString(raw.importance)?.toLowerCase();
    if (rawImportance && IMPORTANCE_TIERS.has(rawImportance)) {
      importanceTier = rawImportance as ImportanceTier;
    } else if (rawImportance) {
      eventWarnings.push({
        code: 'importance_downgraded',
        message: `Invalid importance "${rawImportance}"; downgraded to unknown.`,
        sourceEventId,
      });
    }

    let scheduledFor: string | null = null;
    const rawScheduled = asString(raw.scheduledFor);
    if (rawScheduled === undefined) {
      if (statusHint === 'scheduled') {
        quarantine('missing_scheduled_for');
        return;
      }
      eventWarnings.push({
        code: 'missing_scheduled_for',
        message: 'No scheduledFor; left null (not backfilled).',
        sourceEventId,
      });
    } else {
      const ms = new Date(rawScheduled).getTime();
      if (Number.isNaN(ms)) {
        if (statusHint === 'scheduled') {
          quarantine('invalid_scheduled_for');
          return;
        }
        eventWarnings.push({
          code: 'invalid_scheduled_for',
          message: 'Unparseable scheduledFor; left null.',
          sourceEventId,
        });
      } else {
        scheduledFor = new Date(ms).toISOString();
      }
    }

    const valuesRaw = (raw.values ?? raw) as Record<string, unknown>;
    const values = {
      previous: asString(valuesRaw.previous),
      forecast: asString(valuesRaw.forecast),
      actual: asString(valuesRaw.actual),
      revised: asString(valuesRaw.revised),
    };

    warnings.push(...eventWarnings);
    parsedEvents.push({
      sourceEventId: sourceEventId ?? canonicalProvided!,
      canonicalEventKey: canonicalKeyFor(raw, eventName),
      eventName,
      country: asString(raw.country),
      currency: asString(raw.currency),
      eventCategory: asString(raw.eventCategory),
      importanceTier,
      scheduledFor,
      statusHint,
      values,
      sourceUrl: asString(raw.sourceUrl),
      sourceTimezone: asString(raw.sourceTimezone),
      rawPayloadId: opts.rawPayloadId,
      parserVersion,
      warnings: eventWarnings,
    });
  });

  return { ...base, ok: true, parsedEvents, malformedRecords, warnings };
};
