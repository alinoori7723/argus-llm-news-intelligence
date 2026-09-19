import { describe, expect, it } from 'vitest';
import {
  FakeWhisperClock,
  InMemoryWhisperHistoryStore,
  WHISPER_RULE_VERSION,
  evaluateWhisperCandidate,
  fixedWhisperClock,
  isoFromMs,
} from '@/domain/whispers';
import {
  buildAuditLinkDisplay,
  buildEvidenceDisplay,
  buildPriorityDisplay,
} from '@/domain/display';
import {
  BASE_MS,
  calendarCandidate,
  calendarDisplay,
  clusterCandidate,
  itemCandidate,
} from './_whisperHelpers';

const decide = (candidate: ReturnType<typeof itemCandidate>, clockMs = BASE_MS) =>
  evaluateWhisperCandidate({
    candidate,
    historyStore: new InMemoryWhisperHistoryStore(),
    clock: fixedWhisperClock(clockMs),
  });

describe('1. WHISPER_RULE_VERSION exists and is stamped on decisions', () => {
  it('exposes the constant and stamps decisions + reasons', () => {
    expect(WHISPER_RULE_VERSION).toBe('whisper-rule-v1');
    const d = decide(itemCandidate());
    expect(d.ruleVersion).toBe('whisper-rule-v1');
    expect(d.reason).toContain('whisper-rule-v1');
  });
});

describe('2. deterministic clock advances without timers', () => {
  it('FakeWhisperClock advances deterministically', () => {
    const c = new FakeWhisperClock(BASE_MS);
    expect(c.now()).toBe(BASE_MS);
    c.advanceMinutes(10);
    expect(c.now()).toBe(BASE_MS + 10 * 60_000);
    c.advanceMs(5_000);
    expect(c.now()).toBe(BASE_MS + 10 * 60_000 + 5_000);
  });
});

describe('4. eligibility gate', () => {
  it('an eligible item is not suppressed', () => {
    expect(decide(itemCandidate()).decision).not.toBe('suppress');
  });

  it('missing evidence suppresses', () => {
    const d = decide(
      itemCandidate({
        evidenceDisplay: {
          label: '',
          referenceType: 'none',
          referenceValue: '',
          isExternal: false,
        },
      }),
    );
    expect(d.decision).toBe('suppress');
    expect(d.eligibilityResult.hardExclusions).toContain('missing_evidence');
  });

  it('missing priority reason suppresses', () => {
    const d = decide(
      itemCandidate({
        priorityDisplay: buildPriorityDisplay(
          { priorityTier: 'P1', urgencyLabel: 'soon', priorityReason: '   ' },
          null,
        ),
      }),
    );
    expect(d.decision).toBe('suppress');
    expect(d.eligibilityResult.hardExclusions).toContain('missing_priority_reason');
  });

  it('missing audit link suppresses', () => {
    const d = decide(
      itemCandidate({ auditLinkDisplay: { label: '', href: '', targetType: 'news_item' } }),
    );
    expect(d.decision).toBe('suppress');
    expect(d.eligibilityResult.hardExclusions).toContain('missing_audit_link');
  });

  it('rumor high-attention suppresses', () => {
    const d = decide(itemCandidate({ verificationTier: 'rumor' }));
    expect(d.decision).toBe('suppress');
    expect(d.eligibilityResult.hardExclusions).toContain('rumor_high_attention');
  });

  it('unverified high-attention suppresses', () => {
    const d = decide(itemCandidate({ verificationTier: 'unverified' }));
    expect(d.decision).toBe('suppress');
    expect(d.eligibilityResult.hardExclusions).toContain('unverified_high_attention');
  });

  it('needs_review source suppresses', () => {
    expect(decide(itemCandidate({ sourceLegalStatus: 'needs_review' })).decision).toBe('suppress');
  });

  it('disabled source suppresses', () => {
    expect(decide(itemCandidate({ sourceEnabled: false })).decision).toBe('suppress');
  });

  it('forbidden action wording suppresses', () => {
    const d = decide(itemCandidate({ containsForbiddenWording: true }));
    expect(d.decision).toBe('suppress');
    expect(d.eligibilityResult.hardExclusions).toContain('forbidden_action_wording');
  });

  it('semantic / unconfirmed cluster suppresses (no ConfirmedClusterDisplay)', () => {
    const d = decide(clusterCandidate(3, { confirmedClusterDisplay: null }));
    expect(d.decision).toBe('suppress');
    expect(d.eligibilityResult.hardExclusions).toContain('unconfirmed_cluster');
  });

  it('a confirmed cluster candidate uses ConfirmedClusterDisplay only and can decide', () => {
    expect(decide(clusterCandidate(3)).decision).toBe('whisper');
  });

  it('stale calendar holds (not suppress, not whisper)', () => {
    const d = decide(
      calendarCandidate({
        calendarConfirmationDisplay: calendarDisplay({
          confirmationState: 'stale',
          canPromoteHighAttention: false,
        }),
      }),
    );
    expect(d.decision).toBe('hold');
    expect(d.reason).toContain('stale_calendar_confirmation');
  });
});

describe('5. decision levels', () => {
  it('confirmed cluster >= 2 (below whisper threshold) produces Glow', () => {
    expect(decide(clusterCandidate(2)).decision).toBe('glow');
  });

  it('confirmed cluster >= 3 produces Whisper when rate limits pass', () => {
    expect(decide(clusterCandidate(3)).decision).toBe('whisper');
  });

  it('high-importance calendar within 60m, fresh, produces Whisper', () => {
    expect(decide(calendarCandidate()).decision).toBe('whisper');
  });

  it('medium-importance calendar outside its 30m window produces Glow', () => {
    const d = decide(
      calendarCandidate({
        calendarImportance: 'medium',
        calendarConfirmationDisplay: calendarDisplay({
          scheduledFor: isoFromMs(BASE_MS + 50 * 60_000),
        }),
      }),
    );
    expect(d.decision).toBe('glow');
  });

  it('an item at P2 produces Glow; P1 produces Whisper', () => {
    expect(decide(itemCandidate({ priorityTier: 'P2' })).decision).toBe('glow');
    expect(decide(itemCandidate({ priorityTier: 'P1' })).decision).toBe('whisper');
  });

  it('ineligible candidate produces Suppress', () => {
    expect(decide(itemCandidate({ promotable: false })).decision).toBe('suppress');
  });
});

describe('7. pre-decision state ordering', () => {
  it('the first eligible Whisper on empty history is allowed (does not count itself)', () => {
    const store = new InMemoryWhisperHistoryStore();
    const d = evaluateWhisperCandidate({
      candidate: clusterCandidate(3),
      historyStore: store,
      clock: fixedWhisperClock(BASE_MS),
    });
    expect(d.decision).toBe('whisper');
    expect(d.rateLimitState.whispersLast15m).toBe(0);
    expect(store.decisionCount).toBe(1);
  });

  it('a second immediate eligible Whisper is held by the cooldown', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = fixedWhisperClock(BASE_MS);
    evaluateWhisperCandidate({
      candidate: clusterCandidate(3, { candidateId: 'a', clusterId: 'ccl.a', sourceId: 'src.a' }),
      historyStore: store,
      clock,
    });
    const second = evaluateWhisperCandidate({
      candidate: clusterCandidate(3, { candidateId: 'b', clusterId: 'ccl.b', sourceId: 'src.b' }),
      historyStore: store,
      clock,
    });
    expect(second.decision).toBe('hold');
    expect(second.reason).toContain('cooldown_active');
    expect(store.decisionCount).toBe(2);
  });
});

describe('audit/evidence are always present on an eligible decision', () => {
  it('a whispered candidate carries evidence + audit + priority reason', () => {
    const candidate = itemCandidate();
    const d = decide(candidate);
    expect(candidate.evidenceDisplay.referenceValue).toBeTruthy();
    expect(candidate.auditLinkDisplay.href).toBeTruthy();
    expect(candidate.priorityDisplay.priorityReason).toBeTruthy();
    expect(d.decision).toBe('whisper');

    expect(
      buildEvidenceDisplay({ url: 'https://x', sourceItemId: 's', itemId: 'i' }).referenceType,
    ).toBe('url');
    expect(buildAuditLinkDisplay('cluster').href).toBe('/clusters');
  });
});
