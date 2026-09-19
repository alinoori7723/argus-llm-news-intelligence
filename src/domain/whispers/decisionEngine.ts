import {
  HIGH_IMPORTANCE_CALENDAR_WINDOW_MINUTES,
  MEDIUM_IMPORTANCE_CALENDAR_WINDOW_MINUTES,
  MINUTE_MS,
  WHISPER_CONFIRMED_CLUSTER_MEMBER_THRESHOLD,
  WHISPER_RULE_VERSION,
  type CooldownState,
  type QuietWindowState,
  type RateLimitState,
  type WhisperCandidate,
  type WhisperClock,
  type WhisperDecision,
  type WhisperDecisionKind,
  type WhisperDecisionRecord,
  type WhisperHistoryStore,
} from './types';
import { isoFromMs } from './clock';
import { evaluateEligibility } from './eligibility';
import {
  calendarSignatureOf,
  evaluateQuietWindow,
  evaluateRateLimits,
  evaluateRepeat,
} from './rateLimits';

const naturalLevel = (candidate: WhisperCandidate, nowMs: number): 'glow' | 'whisper' => {
  if (candidate.candidateSourceType === 'cluster') {
    const n = candidate.confirmedClusterDisplay?.confirmedMemberCount ?? 0;
    return n >= WHISPER_CONFIRMED_CLUSTER_MEMBER_THRESHOLD ? 'whisper' : 'glow';
  }
  if (candidate.candidateSourceType === 'calendar_event') {
    const cc = candidate.calendarConfirmationDisplay;
    const state = cc?.confirmationState;
    const scheduledFor = cc?.scheduledFor ?? null;
    if (!scheduledFor || (state !== 'fresh' && state !== 'aging')) return 'glow';
    const minutesUntil = (Date.parse(scheduledFor) - nowMs) / MINUTE_MS;
    if (minutesUntil < 0) return 'glow';
    const window =
      candidate.calendarImportance === 'high'
        ? HIGH_IMPORTANCE_CALENDAR_WINDOW_MINUTES
        : candidate.calendarImportance === 'medium'
          ? MEDIUM_IMPORTANCE_CALENDAR_WINDOW_MINUTES
          : 0;
    return window > 0 && minutesUntil <= window ? 'whisper' : 'glow';
  }
  const tier = candidate.priorityDisplay.priorityTier;
  return tier === 'P0' || tier === 'P1' ? 'whisper' : 'glow';
};

export interface EvaluateWhisperInput {
  candidate: WhisperCandidate;
  historyStore: WhisperHistoryStore;
  clock: WhisperClock;
}

export const evaluateWhisperCandidate = (input: EvaluateWhisperInput): WhisperDecision => {
  const { candidate, historyStore, clock } = input;
  const snapshot = historyStore.getSnapshot();
  const nowMs = clock.now();
  const createdAt = isoFromMs(nowMs);

  const eligibility = evaluateEligibility(candidate);

  const finalize = (
    decision: WhisperDecisionKind,
    reasonCode: string,
    rateLimitState: RateLimitState,
    cooldownState: CooldownState,
    quietWindowState: QuietWindowState,
    extraInputs: string[],
  ): WhisperDecision => {
    const reason = `${decision}: ${reasonCode} (${WHISPER_RULE_VERSION})`;
    const seq = snapshot.decisionRecords.length;
    const decisionId = `dec-${candidate.candidateId}-${seq}`;
    const whisperDecision: WhisperDecision = {
      decisionId,
      candidateId: candidate.candidateId,
      decision,
      reason,
      deterministicInputs: [...eligibility.deterministicInputs, ...extraInputs],
      eligibilityResult: eligibility,
      rateLimitState,
      cooldownState,
      quietWindowState,
      createdAt,
      ruleVersion: WHISPER_RULE_VERSION,
    };
    const record: WhisperDecisionRecord = {
      recordId: `rec-${decisionId}`,
      decisionId,
      candidateId: candidate.candidateId,
      candidateSourceType: candidate.candidateSourceType,
      decision,
      itemId: candidate.itemId,
      clusterId: candidate.clusterId,
      calendarEventId: candidate.calendarEventId,
      sourceId: candidate.sourceId,
      priorityReason: candidate.priorityDisplay?.priorityReason,
      confirmedMemberCount: candidate.confirmedClusterDisplay?.confirmedMemberCount,
      calendarSignature:
        candidate.candidateSourceType === 'calendar_event'
          ? calendarSignatureOf(candidate)
          : undefined,
      createdAt,
      ruleVersion: WHISPER_RULE_VERSION,
      reason,
    };
    historyStore.appendDecision(record);
    return whisperDecision;
  };

  if (eligibility.status === 'ineligible') {
    return finalize(
      'suppress',
      `ineligible[${eligibility.hardExclusions.join(',')}]`,
      EMPTY_RATE_LIMIT_STATE,
      NOT_EVALUATED_COOLDOWN,
      NOT_EVALUATED_QUIET,
      ['rateLimit=not_evaluated', 'quietWindow=not_evaluated', 'repeat=not_evaluated'],
    );
  }

  const quiet = evaluateQuietWindow(candidate, snapshot, clock);
  const rate = evaluateRateLimits(candidate, snapshot, clock);
  const repeat = evaluateRepeat(candidate, snapshot);
  const extraInputs = [
    `whisperClusterThreshold=${WHISPER_CONFIRMED_CLUSTER_MEMBER_THRESHOLD}`,
    `whispersLast15m=${rate.rateLimitState.whispersLast15m}`,
    `whispersLast60m=${rate.rateLimitState.whispersLast60m}`,
    `cooldownActive=${rate.cooldownState.cooldownActive}`,
    `quietBlocked=${quiet.blocked}`,
    `repeatBlocked=${repeat.blocked}`,
  ];

  if (
    candidate.candidateSourceType === 'calendar_event' &&
    candidate.calendarConfirmationDisplay?.confirmationState === 'stale'
  ) {
    return finalize(
      'hold',
      'stale_calendar_confirmation',
      rate.rateLimitState,
      rate.cooldownState,
      quiet.state,
      extraInputs,
    );
  }

  const level = naturalLevel(candidate, nowMs);
  let decision: WhisperDecisionKind;
  let reasonCode: string;
  if (quiet.blocked) {
    decision = 'hold';
    reasonCode = quiet.reason ?? 'dismissal_quiet_window';
  } else if (repeat.blocked) {
    decision = 'hold';
    reasonCode = repeat.reason ?? 'repeat_suppressed';
  } else if (level === 'whisper' && rate.blocked) {
    decision = 'hold';
    reasonCode = rate.reason ?? 'rate_limited';
  } else {
    decision = level;
    reasonCode = level === 'whisper' ? 'whisper_threshold_met' : 'glow_threshold_met';
  }

  return finalize(
    decision,
    reasonCode,
    rate.rateLimitState,
    rate.cooldownState,
    quiet.state,
    extraInputs,
  );
};

const EMPTY_RATE_LIMIT_STATE: RateLimitState = {
  whispersLast15m: 0,
  whispersLast60m: 0,
  perSourceLast60m: 0,
  perClusterLast120m: 0,
};
const NOT_EVALUATED_COOLDOWN: CooldownState = { cooldownActive: false };
const NOT_EVALUATED_QUIET: QuietWindowState = { blocked: false, activeDismissalTargets: [] };
