import { describe, expect, it } from 'vitest';
import {
  DISMISSAL_QUIET_WINDOW_MS,
  InMemoryWhisperHistoryStore,
  WHISPER_RULE_VERSION,
  evaluateQuietWindow,
  evaluateRateLimits,
  evaluateRepeat,
  evaluateWhisperCandidate,
  fixedWhisperClock,
  isoFromMs,
  type WhisperDecisionRecord,
  type WhisperDismissalRecord,
  type WhisperHistorySnapshot,
} from '@/domain/whispers';
import { BASE_MS, clusterCandidate, itemCandidate } from './_whisperHelpers';

const MIN = 60_000;

const whisperRec = (over: Partial<WhisperDecisionRecord>): WhisperDecisionRecord => ({
  recordId: 'r',
  decisionId: 'd',
  candidateId: 'c',
  candidateSourceType: 'item',
  decision: 'whisper',
  createdAt: isoFromMs(BASE_MS),
  ruleVersion: WHISPER_RULE_VERSION,
  reason: '',
  ...over,
});

const snapshot = (
  decisionRecords: WhisperDecisionRecord[],
  dismissalRecords: WhisperDismissalRecord[] = [],
): WhisperHistorySnapshot => ({
  decisionRecords,
  dismissalRecords,
  interactionRecords: [],
  capturedAt: '',
  ruleVersion: WHISPER_RULE_VERSION,
});

const at = (minsAgo: number) => isoFromMs(BASE_MS - minsAgo * MIN);

describe('6. rate limits (counted from pre-decision whisper records only)', () => {
  const clock = fixedWhisperClock(BASE_MS);

  it('max 2 Whispers per 15 minutes', () => {
    const snap = snapshot([whisperRec({ createdAt: at(6) }), whisperRec({ createdAt: at(7) })]);
    const v = evaluateRateLimits(itemCandidate(), snap, clock);
    expect(v.rateLimitState.whispersLast15m).toBe(2);
    expect(v.blocked).toBe(true);
    expect(v.reason).toBe('rate_limit_global_15m');
  });

  it('max 5 Whispers per hour', () => {
    const snap = snapshot([20, 25, 30, 35, 40].map((m) => whisperRec({ createdAt: at(m) })));
    const v = evaluateRateLimits(itemCandidate(), snap, clock);
    expect(v.rateLimitState.whispersLast60m).toBe(5);
    expect(v.blocked).toBe(true);
    expect(v.reason).toBe('rate_limit_global_60m');
  });

  it('max 2 per source per hour', () => {
    const snap = snapshot([
      whisperRec({ createdAt: at(20), sourceId: 'src.a' }),
      whisperRec({ createdAt: at(40), sourceId: 'src.a' }),
    ]);
    const v = evaluateRateLimits(itemCandidate({ sourceId: 'src.a' }), snap, clock);
    expect(v.rateLimitState.perSourceLast60m).toBe(2);
    expect(v.blocked).toBe(true);
    expect(v.reason).toBe('rate_limit_per_source_60m');
  });

  it('max 1 per cluster per 2 hours', () => {
    const snap = snapshot([whisperRec({ createdAt: at(90), clusterId: 'ccl.1' })]);
    const v = evaluateRateLimits(clusterCandidate(3), snap, clock);
    expect(v.rateLimitState.perClusterLast120m).toBe(1);
    expect(v.blocked).toBe(true);
    expect(v.reason).toBe('rate_limit_per_cluster_120m');
  });

  it('minimum 5-minute cooldown', () => {
    const snap = snapshot([whisperRec({ createdAt: at(2) })]);
    const v = evaluateRateLimits(itemCandidate(), snap, clock);
    expect(v.cooldownState.cooldownActive).toBe(true);
    expect(v.reason).toBe('cooldown_active');
  });

  it('advancing the clock past the window changes the decision deterministically', () => {
    const snap = snapshot([whisperRec({ createdAt: isoFromMs(BASE_MS) })]);
    expect(
      evaluateRateLimits(itemCandidate(), snap, fixedWhisperClock(BASE_MS + 2 * MIN)).blocked,
    ).toBe(true);
    expect(
      evaluateRateLimits(itemCandidate(), snap, fixedWhisperClock(BASE_MS + 6 * MIN)).blocked,
    ).toBe(false);
  });

  it('non-whisper records (glow/hold/suppress) never consume a rate cap', () => {
    const snap = snapshot([
      whisperRec({ createdAt: at(6), decision: 'glow' }),
      whisperRec({ createdAt: at(7), decision: 'hold' }),
      whisperRec({ createdAt: at(8), decision: 'suppress' }),
    ]);
    const v = evaluateRateLimits(itemCandidate(), snap, clock);
    expect(v.rateLimitState.whispersLast15m).toBe(0);
    expect(v.blocked).toBe(false);
  });
});

describe('8. dismissal state is separate from decision history', () => {
  it('a dismissal creates a quiet window that holds the matching item', () => {
    const store = new InMemoryWhisperHistoryStore();
    store.appendDismissal({
      dismissalId: 'dm1',
      targetType: 'item',
      targetId: 'it.1',
      dismissedAt: isoFromMs(BASE_MS),
      quietUntil: isoFromMs(BASE_MS + DISMISSAL_QUIET_WINDOW_MS),
      ruleVersion: WHISPER_RULE_VERSION,
    });
    const d = evaluateWhisperCandidate({
      candidate: itemCandidate({ itemId: 'it.1' }),
      historyStore: store,
      clock: fixedWhisperClock(BASE_MS + 10 * MIN),
    });
    expect(d.decision).toBe('hold');
    expect(d.reason).toContain('dismissal_quiet_window');
  });

  it('the quiet window blocks matching cluster / calendar targets', () => {
    const dm: WhisperDismissalRecord = {
      dismissalId: 'dm',
      targetType: 'cluster',
      targetId: 'ccl.1',
      dismissedAt: isoFromMs(BASE_MS),
      quietUntil: isoFromMs(BASE_MS + DISMISSAL_QUIET_WINDOW_MS),
      ruleVersion: WHISPER_RULE_VERSION,
    };
    const v = evaluateQuietWindow(
      clusterCandidate(3),
      snapshot([], [dm]),
      fixedWhisperClock(BASE_MS),
    );
    expect(v.blocked).toBe(true);
    expect(v.state.activeDismissalTargets).toContain('cluster:ccl.1');
  });

  it('a dismissal does not count as a delivery (rate caps see zero whispers)', () => {
    const dm: WhisperDismissalRecord = {
      dismissalId: 'dm',
      targetType: 'item',
      targetId: 'it.1',
      dismissedAt: isoFromMs(BASE_MS),
      quietUntil: isoFromMs(BASE_MS + DISMISSAL_QUIET_WINDOW_MS),
      ruleVersion: WHISPER_RULE_VERSION,
    };
    const v = evaluateRateLimits(itemCandidate(), snapshot([], [dm]), fixedWhisperClock(BASE_MS));
    expect(v.rateLimitState.whispersLast15m).toBe(0);
  });

  it('a delivery (whisper decision) does not create a dismissal', () => {
    const store = new InMemoryWhisperHistoryStore();
    evaluateWhisperCandidate({
      candidate: clusterCandidate(3),
      historyStore: store,
      clock: fixedWhisperClock(BASE_MS),
    });
    expect(store.decisionCount).toBe(1);
    expect(store.dismissalCount).toBe(0);
  });

  it('an expired dismissal no longer blocks', () => {
    const dm: WhisperDismissalRecord = {
      dismissalId: 'dm',
      targetType: 'item',
      targetId: 'it.1',
      dismissedAt: isoFromMs(BASE_MS),
      quietUntil: isoFromMs(BASE_MS + DISMISSAL_QUIET_WINDOW_MS),
      ruleVersion: WHISPER_RULE_VERSION,
    };
    const afterExpiry = fixedWhisperClock(BASE_MS + DISMISSAL_QUIET_WINDOW_MS + MIN);
    expect(
      evaluateQuietWindow(itemCandidate({ itemId: 'it.1' }), snapshot([], [dm]), afterExpiry)
        .blocked,
    ).toBe(false);
  });
});

describe('9. repeat suppression', () => {
  it('same item cannot repeat without a changed priority reason', () => {
    const snap = snapshot([whisperRec({ itemId: 'it.1', priorityReason: 'reason-A' })]);
    expect(
      evaluateRepeat(itemCandidate({ itemId: 'it.1', priorityReason: 'reason-A' }), snap).blocked,
    ).toBe(true);
    expect(
      evaluateRepeat(itemCandidate({ itemId: 'it.1', priorityReason: 'reason-B' }), snap).blocked,
    ).toBe(false);
  });

  it('same cluster cannot repeat unless member count increases or reason changes', () => {
    const snap = snapshot([
      whisperRec({
        candidateSourceType: 'cluster',
        clusterId: 'ccl.1',
        confirmedMemberCount: 3,
        priorityReason: 'reason-A',
      }),
    ]);

    expect(evaluateRepeat(clusterCandidate(3, { priorityReason: 'reason-A' }), snap).blocked).toBe(
      true,
    );

    expect(evaluateRepeat(clusterCandidate(4, { priorityReason: 'reason-A' }), snap).blocked).toBe(
      false,
    );

    expect(evaluateRepeat(clusterCandidate(3, { priorityReason: 'reason-B' }), snap).blocked).toBe(
      false,
    );
  });

  it('same calendar event cannot repeat unless scheduledFor/confirmation/revision changes', () => {
    const base = itemCandidate({
      candidateId: 'cal',
      candidateSourceType: 'calendar_event',
      calendarEventId: 'evt.1',
      calendarRevisionStatus: 'active',
      calendarConfirmationDisplay: {
        scheduledFor: isoFromMs(BASE_MS + 30 * MIN),
        lastConfirmedAt: isoFromMs(BASE_MS),
        confirmationState: 'fresh',
        canPromoteHighAttention: true,
      },
    });
    const snap = snapshot([
      whisperRec({
        candidateSourceType: 'calendar_event',
        calendarEventId: 'evt.1',
        calendarSignature: `${isoFromMs(BASE_MS + 30 * MIN)}|fresh|active`,
      }),
    ]);

    expect(evaluateRepeat(base, snap).blocked).toBe(true);

    const moved = itemCandidate({
      candidateId: 'cal',
      candidateSourceType: 'calendar_event',
      calendarEventId: 'evt.1',
      calendarRevisionStatus: 'active',
      calendarConfirmationDisplay: {
        scheduledFor: isoFromMs(BASE_MS + 45 * MIN),
        lastConfirmedAt: isoFromMs(BASE_MS),
        confirmationState: 'fresh',
        canPromoteHighAttention: true,
      },
    });
    expect(evaluateRepeat(moved, snap).blocked).toBe(false);
  });

  it('a repeated eligible item resolves to hold with a deterministic reason', () => {
    const store = new InMemoryWhisperHistoryStore();
    evaluateWhisperCandidate({
      candidate: itemCandidate({ itemId: 'it.1', priorityReason: 'reason-A' }),
      historyStore: store,
      clock: fixedWhisperClock(BASE_MS),
    });

    const repeat = evaluateWhisperCandidate({
      candidate: itemCandidate({ itemId: 'it.1', priorityReason: 'reason-A' }),
      historyStore: store,
      clock: fixedWhisperClock(BASE_MS + 10 * MIN),
    });
    expect(repeat.decision).toBe('hold');
    expect(repeat.reason).toContain('repeat_item_no_reason_change');
  });
});
