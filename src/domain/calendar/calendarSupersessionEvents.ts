import type { CalendarEventRevision, ChangeReason } from './types';

export const CALENDAR_SUPERSESSION_RULE_VERSION = 'calendar-supersession-v1';

export type CalendarSupersessionReason =
  | 'changed_time'
  | 'cancelled'
  | 'postponed'
  | 'actual_added'
  | 'corrected'
  | 'other';

export interface CalendarSupersessionEvent {
  supersessionEventId: string;

  calendarEventId: string;
  canonicalEventKey: string;
  sourceId: string;
  sourceEventId: string;
  supersededRevisionId: string;
  supersedingRevisionId: string;
  reason: CalendarSupersessionReason;

  observedAt: string;
  ruleVersion: string;

  sourceUrl?: string;
}

export const supersessionReasonFromChangeReason = (
  changeReason: ChangeReason,
): CalendarSupersessionReason => {
  switch (changeReason) {
    case 'time_changed':
      return 'changed_time';
    case 'cancelled':
      return 'cancelled';
    case 'postponed':
      return 'postponed';
    case 'actual_added':
      return 'actual_added';
    case 'forecast_changed':
    case 'metadata_changed':
      return 'corrected';
    default:
      return 'other';
  }
};

export const applySupersessionEvents = (
  revisions: readonly CalendarEventRevision[],
  events: readonly CalendarSupersessionEvent[],
): CalendarEventRevision[] => {
  const supersededBy = new Map<string, string>();
  for (const e of events) {
    const existing = supersededBy.get(e.supersededRevisionId);
    if (existing !== undefined && existing !== e.supersedingRevisionId) {
      throw new Error(
        `calendar supersession: contradictory events for revision ` +
          `"${e.supersededRevisionId}" (superseded by both "${existing}" and ` +
          `"${e.supersedingRevisionId}")`,
      );
    }
    supersededBy.set(e.supersededRevisionId, e.supersedingRevisionId);
  }

  return revisions.map((r) => {
    const by = supersededBy.get(r.revisionId);
    if (by === undefined) return { ...r };
    return {
      ...r,
      supersededByRevisionId: by,
      revisionStatus: r.revisionStatus === 'active' ? 'superseded' : r.revisionStatus,
    };
  });
};

export interface SupersessionReferenceCheck {
  readonly ok: boolean;

  readonly unresolvedEventIds: readonly string[];
}

export const validateSupersessionReferences = (
  revisions: readonly CalendarEventRevision[],
  events: readonly CalendarSupersessionEvent[],
): SupersessionReferenceCheck => {
  const ids = new Set(revisions.map((r) => r.revisionId));
  const unresolvedEventIds = events
    .filter((e) => !ids.has(e.supersededRevisionId) || !ids.has(e.supersedingRevisionId))
    .map((e) => e.supersessionEventId);
  return {
    ok: unresolvedEventIds.length === 0,
    unresolvedEventIds: Object.freeze(unresolvedEventIds),
  };
};
