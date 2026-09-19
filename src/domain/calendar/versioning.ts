import type {
  CalendarEventRevision,
  CalendarEventValues,
  ChangeReason,
  ParsedCalendarEvent,
  RevisionStatus,
} from './types';

export interface CalendarChangeDecision {
  action: 'create' | 'confirm';
  revisionStatus: RevisionStatus;
  changeReason: ChangeReason;
  scheduledFor: string | null;
  previousScheduledFor?: string;
}

const valuesEqual = (a: CalendarEventValues, b: CalendarEventValues): boolean =>
  a.previous === b.previous &&
  a.forecast === b.forecast &&
  a.actual === b.actual &&
  a.revised === b.revised;

const metadataEqual = (parsed: ParsedCalendarEvent, prior: CalendarEventRevision): boolean =>
  parsed.eventName === prior.eventName &&
  parsed.country === prior.country &&
  parsed.currency === prior.currency &&
  parsed.importanceTier === prior.importanceTier &&
  parsed.eventCategory === prior.eventCategory;

const statusFromHint = (parsed: ParsedCalendarEvent): RevisionStatus => {
  switch (parsed.statusHint) {
    case 'cancelled':
      return 'cancelled';
    case 'postponed':
      return 'postponed';
    case 'completed':
      return 'completed';
    default:
      return 'active';
  }
};

const actualNewlyAdded = (parsed: ParsedCalendarEvent, prior: CalendarEventRevision): boolean =>
  parsed.values.actual !== undefined && parsed.values.actual !== prior.values.actual;

export const decideCalendarChange = (
  parsed: ParsedCalendarEvent,
  prior: CalendarEventRevision | undefined,
): CalendarChangeDecision => {
  if (!prior) {
    return {
      action: 'create',
      revisionStatus: statusFromHint(parsed),
      changeReason: 'first_seen',
      scheduledFor: parsed.scheduledFor,
    };
  }

  const previousScheduledFor = prior.scheduledFor ?? undefined;

  if (parsed.statusHint === 'cancelled' && prior.revisionStatus !== 'cancelled') {
    return {
      action: 'create',
      revisionStatus: 'cancelled',
      changeReason: 'cancelled',
      scheduledFor: parsed.scheduledFor ?? prior.scheduledFor,
      previousScheduledFor,
    };
  }

  if (parsed.statusHint === 'postponed') {
    return {
      action: 'create',
      revisionStatus: 'postponed',
      changeReason: 'postponed',
      scheduledFor: parsed.scheduledFor,
      previousScheduledFor,
    };
  }

  if (parsed.statusHint === 'completed' || actualNewlyAdded(parsed, prior)) {
    return {
      action: 'create',
      revisionStatus: 'completed',
      changeReason: 'actual_added',
      scheduledFor: parsed.scheduledFor ?? prior.scheduledFor,
      previousScheduledFor:
        parsed.scheduledFor !== prior.scheduledFor ? previousScheduledFor : undefined,
    };
  }

  if (parsed.scheduledFor !== prior.scheduledFor) {
    return {
      action: 'create',
      revisionStatus: 'active',
      changeReason: 'time_changed',
      scheduledFor: parsed.scheduledFor,
      previousScheduledFor,
    };
  }

  if (!valuesEqual(parsed.values, prior.values)) {
    return {
      action: 'create',
      revisionStatus: 'active',
      changeReason: 'forecast_changed',
      scheduledFor: parsed.scheduledFor,
    };
  }

  if (!metadataEqual(parsed, prior)) {
    return {
      action: 'create',
      revisionStatus: 'active',
      changeReason: 'metadata_changed',
      scheduledFor: parsed.scheduledFor,
    };
  }

  return {
    action: 'confirm',
    revisionStatus: prior.revisionStatus,
    changeReason: 'unchanged_confirmation',
    scheduledFor: prior.scheduledFor,
  };
};
