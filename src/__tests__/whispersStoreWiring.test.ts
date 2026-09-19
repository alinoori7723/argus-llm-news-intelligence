import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  InMemoryWhisperHistoryStore,
  WHISPER_RULE_VERSION,
  evaluateWhisperCandidate,
  fixedWhisperClock,
  isoFromMs,
  type WhisperDecisionRecord,
  type WhisperDismissalRecord,
} from '@/domain/whispers';
import { BASE_MS, clusterCandidate, itemCandidate } from './_whisperHelpers';

const HERE = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(HERE, '../..');

const decisionRec = (over: Partial<WhisperDecisionRecord> = {}): WhisperDecisionRecord => ({
  recordId: 'r1',
  decisionId: 'd1',
  candidateId: 'c1',
  candidateSourceType: 'item',
  decision: 'whisper',
  createdAt: isoFromMs(BASE_MS),
  ruleVersion: WHISPER_RULE_VERSION,
  reason: 'x',
  ...over,
});

const dismissalRec = (over: Partial<WhisperDismissalRecord> = {}): WhisperDismissalRecord => ({
  dismissalId: 'dm1',
  targetType: 'item',
  targetId: 'it.1',
  dismissedAt: isoFromMs(BASE_MS),
  quietUntil: isoFromMs(BASE_MS + 60_000),
  ruleVersion: WHISPER_RULE_VERSION,
  ...over,
});

describe('10. append-only InMemoryWhisperHistoryStore', () => {
  it('appends decision and dismissal records separately', () => {
    const store = new InMemoryWhisperHistoryStore();
    store.appendDecision(decisionRec());
    store.appendDismissal(dismissalRec());
    expect(store.decisionCount).toBe(1);
    expect(store.dismissalCount).toBe(1);
    const snap = store.getSnapshot();
    expect(snap.decisionRecords).toHaveLength(1);
    expect(snap.dismissalRecords).toHaveLength(1);
  });

  it('getters return defensive copies (no mutation leak)', () => {
    const store = new InMemoryWhisperHistoryStore();
    store.appendDecision(decisionRec({ recordId: 'orig' }));
    const snap = store.getSnapshot();

    (snap.decisionRecords as WhisperDecisionRecord[]).push(decisionRec({ recordId: 'evil' }));
    (snap.decisionRecords[0] as WhisperDecisionRecord).recordId = 'tampered';
    const fresh = store.getSnapshot();
    expect(fresh.decisionRecords).toHaveLength(1);
    expect(fresh.decisionRecords[0].recordId).toBe('orig');
  });

  it('prior records are preserved across appends (append-only)', () => {
    const store = new InMemoryWhisperHistoryStore();
    store.appendDecision(decisionRec({ recordId: 'first' }));
    store.appendDecision(decisionRec({ recordId: 'second' }));
    const snap = store.getSnapshot();
    expect(snap.decisionRecords.map((r) => r.recordId)).toEqual(['first', 'second']);
  });
});

describe('11. runtime wiring (presence + absence)', () => {
  it('the public entry point enforces eligibility (ineligible never whispers/glows)', () => {
    for (const c of [
      itemCandidate({ verificationTier: 'rumor' }),
      itemCandidate({ sourceLegalStatus: 'needs_review' }),
      itemCandidate({ promotable: false }),
    ]) {
      const d = evaluateWhisperCandidate({
        candidate: c,
        historyStore: new InMemoryWhisperHistoryStore(),
        clock: fixedWhisperClock(BASE_MS),
      });
      expect(d.decision).toBe('suppress');
    }
  });

  it('the public entry point enforces rate limits (cooldown holds the second)', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = fixedWhisperClock(BASE_MS);
    const first = evaluateWhisperCandidate({
      candidate: clusterCandidate(3, { clusterId: 'ccl.a', sourceId: 'src.a' }),
      historyStore: store,
      clock,
    });
    const second = evaluateWhisperCandidate({
      candidate: clusterCandidate(3, { clusterId: 'ccl.b', sourceId: 'src.b' }),
      historyStore: store,
      clock,
    });
    expect(first.decision).toBe('whisper');
    expect(second.decision).toBe('hold');
  });

  it('the public entry point appends the decision AFTER deciding', () => {
    const store = new InMemoryWhisperHistoryStore();
    const d = evaluateWhisperCandidate({
      candidate: clusterCandidate(3),
      historyStore: store,
      clock: fixedWhisperClock(BASE_MS),
    });
    expect(d.rateLimitState.whispersLast15m).toBe(0);
    expect(store.decisionCount).toBe(1);
  });

  it('NO page or component imports the engine / candidate / store / helpers', () => {
    const scanDir = (rel: string): string[] => {
      const dir = join(repoRoot, rel);
      if (!existsSync(dir)) return [];
      const out: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...scanDir(join(rel, entry.name)));
        else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
      }
      return out;
    };
    const FORBIDDEN =
      /\bevaluateWhisperCandidate\b|\bWhisperCandidate\b|\bWhisperHistoryStore\b|\bInMemoryWhisperHistoryStore\b|\bselectWhisperDecisions\b|\bevaluateEligibility\b|\bevaluateRateLimits\b|\bevaluateRepeat\b|\bevaluateQuietWindow\b/;
    const offenders = [...scanDir('src/pages'), ...scanDir('src/components')].filter((f) =>
      FORBIDDEN.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('versioned decision contract', () => {
  it('WHISPER_RULE_VERSION is defined in src/domain/whispers', () => {
    const types = readFileSync(join(repoRoot, 'src/domain/whispers/types.ts'), 'utf8');
    expect(types).toMatch(/WHISPER_RULE_VERSION\s*=\s*'whisper-rule-v1'/);
  });
});
