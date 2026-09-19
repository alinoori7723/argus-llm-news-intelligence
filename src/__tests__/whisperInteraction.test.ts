import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DISMISSAL_QUIET_WINDOW_MINUTES,
  FakeWhisperClock,
  InMemoryWhisperHistoryStore,
  WHISPER_RULE_VERSION,
  evaluateWhisperCandidate,
  recordWhisperInteraction,
  type WhisperInteractionIntent,
} from '@/domain/whispers';
import { itemCandidate, BASE_MS } from './_whisperHelpers';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const intent = (over: Partial<WhisperInteractionIntent> = {}): WhisperInteractionIntent => ({
  intentId: 'int.1',
  interactionType: 'dismiss',
  targetType: 'item',
  targetId: 'it.1',
  decisionId: 'dec.1',
  ...over,
});

describe('A. recordWhisperInteraction action', () => {
  it('dismiss appends a WhisperDismissalRecord with clock-derived quietUntil + rule version', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    const res = recordWhisperInteraction({ intent: intent(), clock, historyStore: store });

    expect(res.status).toBe('recorded');
    expect(res.ruleVersion).toBe(WHISPER_RULE_VERSION);
    expect(res.appendedRecords).toEqual([{ kind: 'dismissal', recordId: 'wdis-int.1' }]);
    expect(store.dismissalCount).toBe(1);
    expect(store.interactionCount).toBe(0);

    const d = store.getSnapshot().dismissalRecords[0];
    expect(d.targetType).toBe('item');
    expect(d.targetId).toBe('it.1');
    expect(d.ruleVersion).toBe(WHISPER_RULE_VERSION);
    expect(Date.parse(d.quietUntil)).toBe(BASE_MS + DISMISSAL_QUIET_WINDOW_MINUTES * 60_000);
  });

  it('repeated dismiss inside the active quiet window is ignored and does NOT extend quietUntil', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    recordWhisperInteraction({ intent: intent({ intentId: 'a' }), clock, historyStore: store });
    const firstQuietUntil = store.getSnapshot().dismissalRecords[0].quietUntil;

    clock.advanceMinutes(30);
    const res2 = recordWhisperInteraction({
      intent: intent({ intentId: 'b' }),
      clock,
      historyStore: store,
    });

    expect(res2.status).toBe('ignored');
    expect(res2.reason).toBe('already_dismissed_in_quiet_window');
    expect(store.dismissalCount).toBe(1);
    expect(store.interactionCount).toBe(1);
    expect(store.getSnapshot().dismissalRecords[0].quietUntil).toBe(firstQuietUntil);
  });

  it('after the quiet window expires, a new dismiss appends a fresh dismissal', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    recordWhisperInteraction({ intent: intent({ intentId: 'a' }), clock, historyStore: store });
    clock.advanceMinutes(DISMISSAL_QUIET_WINDOW_MINUTES + 1);
    const res2 = recordWhisperInteraction({
      intent: intent({ intentId: 'b' }),
      clock,
      historyStore: store,
    });

    expect(res2.status).toBe('recorded');
    expect(store.dismissalCount).toBe(2);
    const second = store.getSnapshot().dismissalRecords[1];
    expect(Date.parse(second.quietUntil)).toBe(
      BASE_MS + (DISMISSAL_QUIET_WINDOW_MINUTES + 1 + DISMISSAL_QUIET_WINDOW_MINUTES) * 60_000,
    );
  });

  it('mark_seen appends a separate interaction record (not a dismissal, no quiet window)', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    const res = recordWhisperInteraction({
      intent: intent({ interactionType: 'mark_seen' }),
      clock,
      historyStore: store,
    });
    expect(res.status).toBe('recorded');
    expect(store.dismissalCount).toBe(0);
    expect(store.interactionCount).toBe(1);
    const rec = store.getSnapshot().interactionRecords[0];
    expect(rec.interactionType).toBe('mark_seen');
    expect(rec.recordedAt).toBe(new Date(BASE_MS).toISOString());
  });

  it('open_audit and open_evidence append separate interaction records, never dismissals', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    recordWhisperInteraction({
      intent: intent({ intentId: 'x', interactionType: 'open_audit' }),
      clock,
      historyStore: store,
    });
    recordWhisperInteraction({
      intent: intent({ intentId: 'y', interactionType: 'open_evidence' }),
      clock,
      historyStore: store,
    });
    expect(store.dismissalCount).toBe(0);
    expect(store.interactionCount).toBe(2);
    expect(store.getSnapshot().interactionRecords.map((r) => r.interactionType)).toEqual([
      'open_audit',
      'open_evidence',
    ]);
  });

  it('malformed intent is rejected with a deterministic reason and appends nothing', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    const bad = recordWhisperInteraction({
      intent: { intentId: '', interactionType: 'dismiss', targetType: 'item', targetId: 'it.1' },
      clock,
      historyStore: store,
    });
    expect(bad.status).toBe('rejected');
    expect(bad.reason).toBe('malformed_intent');
    expect(store.dismissalCount).toBe(0);
    expect(store.interactionCount).toBe(0);
  });

  it('missing target id is rejected deterministically', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    const res = recordWhisperInteraction({
      intent: intent({ targetId: '' }),
      clock,
      historyStore: store,
    });
    expect(res.status).toBe('rejected');
    expect(res.reason).toBe('missing_target');
  });

  it('an unknown targetType (cast) is rejected deterministically and appends NOTHING', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    const adHoc = {
      intentId: 'cast.1',
      interactionType: 'dismiss',
      targetType: 'galaxy',
      targetId: 'it.1',
    } as unknown as WhisperInteractionIntent;
    const res = recordWhisperInteraction({ intent: adHoc, clock, historyStore: store });

    expect(res.status).toBe('rejected');
    expect(res.reason).toBe('malformed_intent');
    expect(res.appendedRecords).toEqual([]);

    expect(store.dismissalCount).toBe(0);
    expect(store.interactionCount).toBe(0);
    expect(store.decisionCount).toBe(0);
    expect(store.getSnapshot().dismissalRecords).toEqual([]);
  });

  it('dismiss against a non-dismissable "decision" target is rejected; no dismissal/quiet window', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    const res = recordWhisperInteraction({
      intent: intent({ targetType: 'decision', targetId: 'dec.1' }),
      clock,
      historyStore: store,
    });

    expect(res.status).toBe('rejected');
    expect(res.reason).toBe('undismissable_target');
    expect(res.appendedRecords).toEqual([]);

    expect(store.dismissalCount).toBe(0);
    expect(store.interactionCount).toBe(0);
    expect(store.decisionCount).toBe(0);
  });

  it('rejected interactions do not overwrite a prior valid dismissal', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    recordWhisperInteraction({ intent: intent({ intentId: 'ok' }), clock, historyStore: store });
    const before = JSON.stringify(store.getSnapshot().dismissalRecords);

    recordWhisperInteraction({
      intent: intent({ intentId: 'bad', targetType: 'decision', targetId: 'dec.1' }),
      clock,
      historyStore: store,
    });
    expect(JSON.stringify(store.getSnapshot().dismissalRecords)).toBe(before);
    expect(store.dismissalCount).toBe(1);
  });

  it('UI-supplied createdAt / ruleVersion / quietUntil are IGNORED (stamped from clock instead)', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    const tampered = {
      ...intent({ interactionType: 'mark_seen' }),
      createdAt: '1999-01-01T00:00:00.000Z',
      recordedAt: '1999-01-01T00:00:00.000Z',
      ruleVersion: 'attacker-rule',
      quietUntil: '1999-01-01T00:00:00.000Z',
    } as unknown as WhisperInteractionIntent;
    const res = recordWhisperInteraction({ intent: tampered, clock, historyStore: store });
    expect(res.ruleVersion).toBe(WHISPER_RULE_VERSION);
    const rec = store.getSnapshot().interactionRecords[0];
    expect(rec.recordedAt).toBe(new Date(BASE_MS).toISOString());
    expect(rec.ruleVersion).toBe(WHISPER_RULE_VERSION);
    expect(JSON.stringify(rec)).not.toContain('1999');
    expect(JSON.stringify(rec)).not.toContain('attacker-rule');
    expect(JSON.stringify(rec)).not.toContain('quietUntil');
  });

  it('no Date.now / no-arg new Date in the action source', () => {
    const code = readFileSync(
      resolve(repoRoot, 'src/domain/whispers/recordWhisperInteraction.ts'),
      'utf8',
    );
    expect(code).not.toMatch(/Date\.now\s*\(/);
    expect(code).not.toMatch(/new Date\s*\(\s*\)/);
  });
});

describe('B. history store separation + append-only', () => {
  it('decisions, dismissals, and interactions are three separate append-only arrays', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);

    evaluateWhisperCandidate({ candidate: itemCandidate(), historyStore: store, clock });

    recordWhisperInteraction({ intent: intent({ intentId: 'd1' }), clock, historyStore: store });

    recordWhisperInteraction({
      intent: intent({ intentId: 's1', interactionType: 'mark_seen' }),
      clock,
      historyStore: store,
    });

    const snap = store.getSnapshot();
    expect(snap.decisionRecords.length).toBe(1);
    expect(snap.dismissalRecords.length).toBe(1);
    expect(snap.interactionRecords.length).toBe(1);
  });

  it('getters return defensive copies (mutating a snapshot does not affect the store)', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    recordWhisperInteraction({
      intent: intent({ interactionType: 'mark_seen' }),
      clock,
      historyStore: store,
    });
    const snap = store.getSnapshot();
    (snap.interactionRecords as unknown as unknown[]).push({ tampered: true });
    expect(store.getSnapshot().interactionRecords.length).toBe(1);
  });

  it('the no-op repeat dismiss does not overwrite the original dismissal', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    recordWhisperInteraction({
      intent: intent({ intentId: 'a', reason: 'too_noisy' }),
      clock,
      historyStore: store,
    });
    const before = JSON.stringify(store.getSnapshot().dismissalRecords[0]);
    recordWhisperInteraction({ intent: intent({ intentId: 'b' }), clock, historyStore: store });
    expect(JSON.stringify(store.getSnapshot().dismissalRecords[0])).toBe(before);
  });
});

describe('C. dismissal feeds back into future engine decisions', () => {
  it('after dismissing an item, a future decision for the same item is HELD by the quiet window', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);

    recordWhisperInteraction({ intent: intent({ targetId: 'it.1' }), clock, historyStore: store });

    const decision = evaluateWhisperCandidate({
      candidate: itemCandidate({ candidateId: 'c', itemId: 'it.1', priorityTier: 'P0' }),
      historyStore: store,
      clock,
    });
    expect(decision.decision).toBe('hold');
    expect(decision.reason).toContain('dismissal_quiet_window');
  });

  it('dismissal does not consume a whisper rate-limit delivery count', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    recordWhisperInteraction({
      intent: intent({ targetId: 'it.other' }),
      clock,
      historyStore: store,
    });
    const decision = evaluateWhisperCandidate({
      candidate: itemCandidate({ candidateId: 'c', itemId: 'it.1', priorityTier: 'P0' }),
      historyStore: store,
      clock,
    });

    expect(decision.rateLimitState.whispersLast15m).toBe(0);
    expect(decision.decision).toBe('whisper');
  });

  it('mark_seen does NOT create a quiet window (future decision is unaffected)', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    recordWhisperInteraction({
      intent: intent({ targetId: 'it.1', interactionType: 'mark_seen' }),
      clock,
      historyStore: store,
    });
    const decision = evaluateWhisperCandidate({
      candidate: itemCandidate({ candidateId: 'c', itemId: 'it.1', priorityTier: 'P0' }),
      historyStore: store,
      clock,
    });
    expect(decision.decision).toBe('whisper');
    expect(decision.quietWindowState.blocked).toBe(false);
  });

  it('open_audit / open_evidence do NOT create a quiet window', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    recordWhisperInteraction({
      intent: intent({ targetId: 'it.1', intentId: 'oa', interactionType: 'open_audit' }),
      clock,
      historyStore: store,
    });
    recordWhisperInteraction({
      intent: intent({ targetId: 'it.1', intentId: 'oe', interactionType: 'open_evidence' }),
      clock,
      historyStore: store,
    });
    const decision = evaluateWhisperCandidate({
      candidate: itemCandidate({ candidateId: 'c', itemId: 'it.1', priorityTier: 'P0' }),
      historyStore: store,
      clock,
    });
    expect(decision.decision).toBe('whisper');
  });

  it('advancing the clock past the quiet window allows a future decision again', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    recordWhisperInteraction({ intent: intent({ targetId: 'it.1' }), clock, historyStore: store });
    clock.advanceMinutes(DISMISSAL_QUIET_WINDOW_MINUTES + 1);
    const decision = evaluateWhisperCandidate({
      candidate: itemCandidate({ candidateId: 'c', itemId: 'it.1', priorityTier: 'P0' }),
      historyStore: store,
      clock,
    });
    expect(decision.decision).toBe('whisper');
  });
});
