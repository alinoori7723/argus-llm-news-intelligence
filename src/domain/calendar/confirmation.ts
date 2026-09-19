import type {
  CalendarConfirmation,
  CalendarEventRevision,
  ConfirmationState,
  ImportanceTier,
} from './types';

const FRESH_WINDOW_MIN: Record<ImportanceTier, number> = {
  high: 30,
  medium: 60,
  low: 120,
  unknown: 120,
};

const PROXIMITY_WINDOW_MIN = 120;

export const effectiveLastConfirmedAt = (
  revision: Pick<CalendarEventRevision, 'revisionId' | 'lastConfirmedAt'>,
  confirmations: readonly CalendarConfirmation[],
): string => {
  let bestMs = Date.parse(revision.lastConfirmedAt);
  let best = revision.lastConfirmedAt;
  for (const c of confirmations) {
    if (c.revisionId !== revision.revisionId) continue;
    const ms = Date.parse(c.confirmedAt);
    if (!Number.isNaN(ms) && ms > bestMs) {
      bestMs = ms;
      best = c.confirmedAt;
    }
  }
  return best;
};

export const confirmationAgeMinutes = (
  lastConfirmedAt: string | null | undefined,
  now: Date,
): number | null => {
  if (!lastConfirmedAt) return null;
  const ms = Date.parse(lastConfirmedAt);
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor((now.getTime() - ms) / 60_000));
};

export const minutesUntilScheduled = (scheduledFor: string | null, now: Date): number | null => {
  if (!scheduledFor) return null;
  const ms = Date.parse(scheduledFor);
  if (Number.isNaN(ms)) return null;
  return Math.floor((ms - now.getTime()) / 60_000);
};

export const confirmationStateFor = (
  importance: ImportanceTier,
  lastConfirmedAt: string | null | undefined,
  now: Date,
): ConfirmationState => {
  const age = confirmationAgeMinutes(lastConfirmedAt, now);
  if (age === null) return 'unknown';
  const window = FRESH_WINDOW_MIN[importance];
  if (age <= window) return 'fresh';
  if (age <= window * 2) return 'aging';
  return 'stale';
};

export interface CalendarPromotionVerdict {
  eligible: boolean;
  confirmationState: ConfirmationState;
  confirmationAgeMin: number | null;
  minutesUntil: number | null;
  reason: string;
}

const hasEvidence = (revision: CalendarEventRevision): boolean =>
  Boolean(revision.sourceUrl) || Boolean(revision.sourceEventId);

export const evaluateCalendarPromotion = (
  revision: CalendarEventRevision,
  effLastConfirmedAt: string,
  now: Date,
): CalendarPromotionVerdict => {
  const confirmationState = confirmationStateFor(revision.importanceTier, effLastConfirmedAt, now);
  const confirmationAgeMin = confirmationAgeMinutes(effLastConfirmedAt, now);
  const minutesUntil = minutesUntilScheduled(revision.scheduledFor, now);
  const fail = (reason: string): CalendarPromotionVerdict => ({
    eligible: false,
    confirmationState,
    confirmationAgeMin,
    minutesUntil,
    reason,
  });

  if (revision.revisionStatus !== 'active') {
    return fail(`status ${revision.revisionStatus} is never high-attention`);
  }
  if (revision.scheduledFor === null || minutesUntil === null) {
    return fail('no scheduledFor');
  }
  if (minutesUntil < 0) {
    return fail('scheduledFor is in the past');
  }
  if (!hasEvidence(revision)) {
    return fail('no evidence reference (sourceUrl or sourceEventId)');
  }
  if (minutesUntil <= PROXIMITY_WINDOW_MIN) {
    if (confirmationState !== 'fresh') {
      return fail(`within 2h but confirmation is ${confirmationState}`);
    }
  } else if (confirmationState === 'stale') {
    return fail('confirmation is stale');
  }

  return {
    eligible: true,
    confirmationState,
    confirmationAgeMin,
    minutesUntil,
    reason: 'active + future + evidence + confirmation ok',
  };
};
