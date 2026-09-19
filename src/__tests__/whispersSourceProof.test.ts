import { describe, expect, it } from 'vitest';
import {
  InMemoryWhisperHistoryStore,
  evaluateWhisperCandidate,
  fixedWhisperClock,
  type WhisperCandidate,
} from '@/domain/whispers';
import { BASE_MS, clusterCandidate, itemCandidate } from './_whisperHelpers';

const decide = (candidate: WhisperCandidate) =>
  evaluateWhisperCandidate({
    candidate,
    historyStore: new InMemoryWhisperHistoryStore(),
    clock: fixedWhisperClock(BASE_MS),
  });

const without = (c: WhisperCandidate, field: keyof WhisperCandidate): WhisperCandidate => {
  const copy = { ...c };
  delete (copy as Record<string, unknown>)[field];
  return copy as WhisperCandidate;
};

describe('A. positive source proof is required (public entry)', () => {
  it('an allowed + enabled candidate can still whisper when otherwise eligible', () => {
    expect(decide(clusterCandidate(3)).decision).toBe('whisper');
    expect(
      decide(itemCandidate({ sourceLegalStatus: 'allowed', sourceEnabled: true })).decision,
    ).toBe('whisper');
  });

  it('missing sourceLegalStatus suppresses', () => {
    const d = decide(without(itemCandidate(), 'sourceLegalStatus'));
    expect(d.decision).toBe('suppress');
    expect(d.eligibilityResult.hardExclusions).toContain('missing_source_legal_status');
    expect(d.eligibilityResult.hardExclusions).toContain('missing_source_proof');
  });

  it('missing sourceEnabled suppresses', () => {
    const d = decide(without(itemCandidate(), 'sourceEnabled'));
    expect(d.decision).toBe('suppress');
    expect(d.eligibilityResult.hardExclusions).toContain('missing_source_enabled');
    expect(d.eligibilityResult.hardExclusions).toContain('missing_source_proof');
  });

  it('needs_review suppresses', () => {
    const d = decide(itemCandidate({ sourceLegalStatus: 'needs_review' }));
    expect(d.decision).toBe('suppress');
    expect(d.eligibilityResult.hardExclusions).toContain('source_needs_review');
  });

  it('disabled legalStatus suppresses', () => {
    const d = decide(itemCandidate({ sourceLegalStatus: 'disabled' }));
    expect(d.decision).toBe('suppress');
    expect(d.eligibilityResult.hardExclusions).toContain('source_disabled');
  });

  it('sourceEnabled === false suppresses', () => {
    const d = decide(itemCandidate({ sourceEnabled: false }));
    expect(d.decision).toBe('suppress');
    expect(d.eligibilityResult.hardExclusions).toContain('source_disabled');
  });

  it('NONE of the bad/missing-proof cases can produce glow or whisper', () => {
    const bad: WhisperCandidate[] = [
      without(itemCandidate(), 'sourceLegalStatus'),
      without(itemCandidate(), 'sourceEnabled'),
      itemCandidate({ sourceLegalStatus: 'needs_review' }),
      itemCandidate({ sourceLegalStatus: 'disabled' }),
      itemCandidate({ sourceEnabled: false }),

      { ...itemCandidate(), sourceLegalStatus: undefined } as unknown as WhisperCandidate,
    ];
    for (const c of bad) {
      const d = decide(c);
      expect(d.decision).toBe('suppress');
      expect(['glow', 'whisper']).not.toContain(d.decision);
    }
  });
});

describe('B. runtime defensive guard (ad hoc / cast objects)', () => {
  it('a cast object with both source fields missing suppresses with a source-proof reason', () => {
    const c = without(without(itemCandidate(), 'sourceLegalStatus'), 'sourceEnabled');
    const d = decide(c);
    expect(d.decision).toBe('suppress');
    expect(d.reason).toContain('missing_source_proof');
  });
});

describe('C. ineligible candidate short-circuits before rate-limit/cooldown/repeat', () => {
  it('does NOT evaluate rate-limit/cooldown/quiet state for an ineligible candidate', () => {
    const d = decide(without(itemCandidate(), 'sourceLegalStatus'));
    expect(d.decision).toBe('suppress');
    expect(d.rateLimitState).toEqual({
      whispersLast15m: 0,
      whispersLast60m: 0,
      perSourceLast60m: 0,
      perClusterLast120m: 0,
    });
    expect(d.cooldownState.cooldownActive).toBe(false);
    expect(d.quietWindowState.blocked).toBe(false);
    expect(d.deterministicInputs).toContain('rateLimit=not_evaluated');
    expect(d.deterministicInputs).toContain('quietWindow=not_evaluated');
    expect(d.deterministicInputs).toContain('repeat=not_evaluated');
  });

  it('the suppress decision shows eligibility failure as the primary reason and is still appended', () => {
    const store = new InMemoryWhisperHistoryStore();
    const d = evaluateWhisperCandidate({
      candidate: itemCandidate({ sourceLegalStatus: 'needs_review' }),
      historyStore: store,
      clock: fixedWhisperClock(BASE_MS),
    });
    expect(d.reason).toMatch(/^suppress: ineligible\[/);
    expect(store.decisionCount).toBe(1);
  });

  it('a prior ineligible suppress does not consume a rate cap for the next eligible Whisper', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = fixedWhisperClock(BASE_MS);
    evaluateWhisperCandidate({
      candidate: itemCandidate({ sourceLegalStatus: 'disabled' }),
      historyStore: store,
      clock,
    });
    const next = evaluateWhisperCandidate({
      candidate: clusterCandidate(3),
      historyStore: store,
      clock,
    });

    expect(next.decision).toBe('whisper');
    expect(next.rateLimitState.whispersLast15m).toBe(0);
  });
});

describe('E. runtime-wiring: no public path produces attention without source proof', () => {
  it('every missing/unknown/bad source-proof candidate suppresses via evaluateWhisperCandidate', () => {
    const strongButUnproven = without(clusterCandidate(5), 'sourceLegalStatus');
    expect(decide(strongButUnproven).decision).toBe('suppress');
    const strongDisabled = clusterCandidate(5, { sourceEnabled: false });
    expect(decide(strongDisabled).decision).toBe('suppress');
  });
});
