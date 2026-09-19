import {
  DISMISSAL_QUIET_WINDOW_MINUTES,
  MAX_WHISPERS_PER_15_MINUTES,
  MAX_WHISPERS_PER_CLUSTER_PER_2_HOURS,
  MAX_WHISPERS_PER_HOUR,
  MAX_WHISPERS_PER_SOURCE_PER_HOUR,
  MIN_COOLDOWN_BETWEEN_WHISPERS_MINUTES,
  MINUTE_MS,
  type CooldownState,
  type QuietWindowState,
  type RateLimitState,
  type WhisperCandidate,
  type WhisperClock,
  type WhisperDecisionRecord,
  type WhisperHistorySnapshot,
} from './types';

const whisperRecords = (snapshot: WhisperHistorySnapshot): WhisperDecisionRecord[] =>
  snapshot.decisionRecords.filter((r) => r.decision === 'whisper');

const countWithin = (
  records: WhisperDecisionRecord[],
  nowMs: number,
  windowMs: number,
  pred?: (r: WhisperDecisionRecord) => boolean,
): number =>
  records.filter((r) => {
    const t = Date.parse(r.createdAt);
    if (Number.isNaN(t) || nowMs - t >= windowMs) return false;
    return pred ? pred(r) : true;
  }).length;

export interface RateLimitVerdict {
  blocked: boolean;
  reason?: string;
  rateLimitState: RateLimitState;
  cooldownState: CooldownState;
}

export const evaluateRateLimits = (
  candidate: WhisperCandidate,
  snapshot: WhisperHistorySnapshot,
  clock: WhisperClock,
): RateLimitVerdict => {
  const nowMs = clock.now();
  const whispers = whisperRecords(snapshot);

  const rateLimitState: RateLimitState = {
    whispersLast15m: countWithin(whispers, nowMs, 15 * MINUTE_MS),
    whispersLast60m: countWithin(whispers, nowMs, 60 * MINUTE_MS),
    perSourceLast60m: countWithin(
      whispers,
      nowMs,
      60 * MINUTE_MS,
      (r) => candidate.sourceId !== undefined && r.sourceId === candidate.sourceId,
    ),
    perClusterLast120m: countWithin(
      whispers,
      nowMs,
      120 * MINUTE_MS,
      (r) => candidate.clusterId !== undefined && r.clusterId === candidate.clusterId,
    ),
  };

  let lastWhisperMs = -Infinity;
  for (const r of whispers) {
    const t = Date.parse(r.createdAt);
    if (!Number.isNaN(t) && t > lastWhisperMs) lastWhisperMs = t;
  }
  const hasPrior = lastWhisperMs !== -Infinity;
  const msSinceLastWhisper = hasPrior ? nowMs - lastWhisperMs : undefined;
  const cooldownActive =
    hasPrior && (msSinceLastWhisper as number) < MIN_COOLDOWN_BETWEEN_WHISPERS_MINUTES * MINUTE_MS;
  const cooldownState: CooldownState = {
    lastWhisperAt: hasPrior ? new Date(lastWhisperMs).toISOString() : undefined,
    msSinceLastWhisper,
    cooldownActive,
  };

  let blocked = false;
  let reason: string | undefined;
  if (cooldownActive) {
    blocked = true;
    reason = 'cooldown_active';
  } else if (rateLimitState.whispersLast15m >= MAX_WHISPERS_PER_15_MINUTES) {
    blocked = true;
    reason = 'rate_limit_global_15m';
  } else if (rateLimitState.whispersLast60m >= MAX_WHISPERS_PER_HOUR) {
    blocked = true;
    reason = 'rate_limit_global_60m';
  } else if (rateLimitState.perSourceLast60m >= MAX_WHISPERS_PER_SOURCE_PER_HOUR) {
    blocked = true;
    reason = 'rate_limit_per_source_60m';
  } else if (rateLimitState.perClusterLast120m >= MAX_WHISPERS_PER_CLUSTER_PER_2_HOURS) {
    blocked = true;
    reason = 'rate_limit_per_cluster_120m';
  }

  return { blocked, reason, rateLimitState, cooldownState };
};

export interface QuietWindowVerdict {
  blocked: boolean;
  reason?: string;
  state: QuietWindowState;
}

export const evaluateQuietWindow = (
  candidate: WhisperCandidate,
  snapshot: WhisperHistorySnapshot,
  clock: WhisperClock,
): QuietWindowVerdict => {
  const nowMs = clock.now();
  const active = snapshot.dismissalRecords.filter((d) => {
    const until = Date.parse(d.quietUntil);
    return !Number.isNaN(until) && until > nowMs;
  });
  const matches = active.filter((d) => {
    switch (d.targetType) {
      case 'global':
        return true;
      case 'item':
        return candidate.itemId !== undefined && d.targetId === candidate.itemId;
      case 'cluster':
        return candidate.clusterId !== undefined && d.targetId === candidate.clusterId;
      case 'calendar_event':
        return candidate.calendarEventId !== undefined && d.targetId === candidate.calendarEventId;
      case 'source':
        return candidate.sourceId !== undefined && d.targetId === candidate.sourceId;
    }
  });
  const activeDismissalTargets = matches.map((d) => `${d.targetType}:${d.targetId}`);
  return {
    blocked: activeDismissalTargets.length > 0,
    reason: activeDismissalTargets.length > 0 ? 'dismissal_quiet_window' : undefined,
    state: { blocked: activeDismissalTargets.length > 0, activeDismissalTargets },
  };
};

export const calendarSignatureOf = (candidate: WhisperCandidate): string => {
  const cc = candidate.calendarConfirmationDisplay;
  return [
    cc?.scheduledFor ?? 'null',
    cc?.confirmationState ?? 'none',
    candidate.calendarRevisionStatus ?? 'none',
  ].join('|');
};

export interface RepeatVerdict {
  blocked: boolean;
  reason?: string;
}

export const evaluateRepeat = (
  candidate: WhisperCandidate,
  snapshot: WhisperHistorySnapshot,
): RepeatVerdict => {
  const whispers = whisperRecords(snapshot);
  const currentReason = candidate.priorityDisplay.priorityReason;

  if (candidate.candidateSourceType === 'item') {
    const priors = whispers.filter((r) => r.itemId === candidate.itemId);
    if (priors.length === 0) return { blocked: false };
    const sameReason = priors.some((r) => r.priorityReason === currentReason);
    return sameReason
      ? { blocked: true, reason: 'repeat_item_no_reason_change' }
      : { blocked: false };
  }

  if (candidate.candidateSourceType === 'cluster') {
    const priors = whispers.filter((r) => r.clusterId === candidate.clusterId);
    if (priors.length === 0) return { blocked: false };
    const maxPriorCount = priors.reduce((m, r) => Math.max(m, r.confirmedMemberCount ?? 0), 0);
    const currentCount = candidate.confirmedClusterDisplay?.confirmedMemberCount ?? 0;
    const reasonChanged = !priors.some((r) => r.priorityReason === currentReason);
    const grew = currentCount > maxPriorCount;
    return grew || reasonChanged
      ? { blocked: false }
      : { blocked: true, reason: 'repeat_cluster_no_growth_or_reason_change' };
  }

  const priors = whispers.filter((r) => r.calendarEventId === candidate.calendarEventId);
  if (priors.length === 0) return { blocked: false };
  const currentSig = calendarSignatureOf(candidate);
  const seen = priors.some((r) => r.calendarSignature === currentSig);
  return seen ? { blocked: true, reason: 'repeat_calendar_no_change' } : { blocked: false };
};

export const DISMISSAL_QUIET_WINDOW_MS = DISMISSAL_QUIET_WINDOW_MINUTES * MINUTE_MS;
