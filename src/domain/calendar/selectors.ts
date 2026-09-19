import type { CalendarStore } from './store';
import {
  confirmationAgeMinutes,
  confirmationStateFor,
  effectiveLastConfirmedAt,
  evaluateCalendarPromotion,
  minutesUntilScheduled,
  type CalendarPromotionVerdict,
} from './confirmation';
import type { CalendarEventRevision, ConfirmationState } from './types';

export interface CalendarEventView {
  current: CalendarEventRevision;
  effectiveLastConfirmedAt: string;
  confirmationState: ConfirmationState;
  confirmationAgeMin: number | null;
  minutesUntil: number | null;
  promotion: CalendarPromotionVerdict;

  history: CalendarEventRevision[];
}

export const currentRevisions = (store: CalendarStore): CalendarEventRevision[] =>
  store.revisions.filter((r) => r.supersededByRevisionId === undefined);

const historyFor = (
  store: CalendarStore,
  revision: CalendarEventRevision,
): CalendarEventRevision[] =>
  store
    .revisionsForEvent(revision.sourceId, revision.sourceEventId)
    .slice()
    .sort((a, b) => a.revisionNumber - b.revisionNumber);

export const toCalendarEventView = (
  store: CalendarStore,
  revision: CalendarEventRevision,
  now: Date,
): CalendarEventView => {
  const effConfirmed = effectiveLastConfirmedAt(revision, store.confirmations);
  return {
    current: revision,
    effectiveLastConfirmedAt: effConfirmed,
    confirmationState: confirmationStateFor(revision.importanceTier, effConfirmed, now),
    confirmationAgeMin: confirmationAgeMinutes(effConfirmed, now),
    minutesUntil: minutesUntilScheduled(revision.scheduledFor, now),
    promotion: evaluateCalendarPromotion(revision, effConfirmed, now),
    history: historyFor(store, revision),
  };
};

export const calendarEventViews = (store: CalendarStore, now: Date): CalendarEventView[] =>
  currentRevisions(store).map((r) => toCalendarEventView(store, r, now));

export const promotableScheduledViews = (store: CalendarStore, now: Date): CalendarEventView[] =>
  calendarEventViews(store, now)
    .filter((v) => v.promotion.eligible)
    .sort((a, b) => (a.minutesUntil ?? 0) - (b.minutesUntil ?? 0));

export const activeUpcomingViews = (store: CalendarStore, now: Date): CalendarEventView[] =>
  calendarEventViews(store, now).filter(
    (v) =>
      v.current.revisionStatus === 'active' &&
      v.current.scheduledFor !== null &&
      (v.minutesUntil ?? -1) >= 0,
  );

const untilLabel = (minutesUntil: number | null): string => {
  if (minutesUntil === null) return 'time unknown';
  if (minutesUntil < 0) return 'started';
  if (minutesUntil < 60) return `in ${minutesUntil}m`;
  if (minutesUntil < 60 * 24) return `in ${Math.round(minutesUntil / 60)}h`;
  return `in ${Math.round(minutesUntil / (60 * 24))}d`;
};

const confirmLabel = (state: ConfirmationState, ageMin: number | null): string => {
  switch (state) {
    case 'fresh':
      return ageMin !== null ? `confirmed ${ageMin}m ago` : 'confirmed';
    case 'aging':
      return 'confirmation aging';
    case 'stale':
      return 'needs confirmation (stale)';
    default:
      return 'confirmation unknown';
  }
};

export const scheduledSummaryLine = (view: CalendarEventView): string =>
  `${view.current.eventName} ${untilLabel(view.minutesUntil)} · ${confirmLabel(
    view.confirmationState,
    view.confirmationAgeMin,
  )}`;
