import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DISMISSAL_QUIET_WINDOW_MINUTES,
  FakeWhisperClock,
  InMemoryWhisperHistoryStore,
  WHISPER_RULE_VERSION,
  fixedWhisperClock,
  projectWhisperSessionView,
  recordWhisperInteraction,
  type WhisperDecisionView,
  type WhisperViewIdentity,
} from '@/domain/whispers';
import {
  createWhisperSessionController,
  type WhisperSessionController,
} from '@/fixtures/whispers/whisperSessionBootstrap';
import { BASE_MS } from './_whisperHelpers';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const view = (over: Partial<WhisperDecisionView> = {}): WhisperDecisionView =>
  Object.freeze({
    decisionId: 'd.1',
    candidateSourceType: 'item',
    level: 'whisper',
    message: 'Source-backed item to review',
    reason: 'whisper: whisper_threshold_met',
    ruleVersion: WHISPER_RULE_VERSION,
    targetType: 'item',
    targetId: 'it.1',
    ...over,
  });

const idOf = (v: WhisperDecisionView): WhisperViewIdentity => ({
  decisionId: v.decisionId,
  targetType: v.targetType,
  targetId: v.targetId,
});

const dismiss = (
  store: InMemoryWhisperHistoryStore,
  clock: FakeWhisperClock,
  targetId: string,
  intentId = `dis-${targetId}`,
) =>
  recordWhisperInteraction({
    intent: { intentId, interactionType: 'dismiss', targetType: 'item', targetId },
    clock,
    historyStore: store,
  });

describe('A. projectWhisperSessionView (pure)', () => {
  const emptyStore = () => new InMemoryWhisperHistoryStore();

  it('with no dismissals, all non-suppress cards are active', () => {
    const decisions = [
      view({ decisionId: 'd.1', targetId: 'it.1' }),
      view({ decisionId: 'd.2', targetId: 'it.2' }),
    ];
    const session = projectWhisperSessionView({
      decisions,
      historySnapshot: emptyStore().getSnapshot(),
      clock: fixedWhisperClock(BASE_MS),
    });
    expect(session.activeDecisions.map((d) => d.decisionId)).toEqual(['d.1', 'd.2']);
    expect(session.heldByInteraction).toEqual([]);
  });

  it('an active dismissal quiet window holds the matching card out of active attention', () => {
    const store = emptyStore();
    const clock = new FakeWhisperClock(BASE_MS);
    dismiss(store, clock, 'it.1');
    const decisions = [
      view({ decisionId: 'd.1', targetId: 'it.1' }),
      view({ decisionId: 'd.2', targetId: 'it.2' }),
    ];
    const session = projectWhisperSessionView({
      decisions,
      historySnapshot: store.getSnapshot(),
      clock,
    });

    expect(session.activeDecisions.map((d) => d.decisionId)).toEqual(['d.2']);
    expect(session.heldByInteraction.map((d) => d.decisionId)).toEqual(['d.1']);
    const p = session.projections.find((x) => x.decisionId === 'd.1');
    expect(p?.projectionReason).toBe('dismissed_quiet_window');
    expect(p?.quietUntil).toBeTruthy();
  });

  it('does not hold unrelated cards', () => {
    const store = emptyStore();
    const clock = new FakeWhisperClock(BASE_MS);
    dismiss(store, clock, 'it.1');
    const decisions = [view({ decisionId: 'd.2', targetId: 'it.2' })];
    const session = projectWhisperSessionView({
      decisions,
      historySnapshot: store.getSnapshot(),
      clock,
    });
    expect(session.activeDecisions.map((d) => d.decisionId)).toEqual(['d.2']);
    expect(session.heldByInteraction).toEqual([]);
  });

  it('after quietUntil expires the card returns to active (expired_quiet_window)', () => {
    const store = emptyStore();
    const clock = new FakeWhisperClock(BASE_MS);
    dismiss(store, clock, 'it.1');
    clock.advanceMinutes(DISMISSAL_QUIET_WINDOW_MINUTES + 1);
    const decisions = [view({ decisionId: 'd.1', targetId: 'it.1' })];
    const session = projectWhisperSessionView({
      decisions,
      historySnapshot: store.getSnapshot(),
      clock,
    });
    expect(session.activeDecisions.map((d) => d.decisionId)).toEqual(['d.1']);
    expect(session.heldByInteraction).toEqual([]);
    expect(session.projections[0].projectionReason).toBe('expired_quiet_window');
  });

  it('mark_seen does not hold/remove the card', () => {
    const store = emptyStore();
    const clock = new FakeWhisperClock(BASE_MS);
    recordWhisperInteraction({
      intent: {
        intentId: 's1',
        interactionType: 'mark_seen',
        targetType: 'item',
        targetId: 'it.1',
      },
      clock,
      historyStore: store,
    });
    const decisions = [view({ decisionId: 'd.1', targetId: 'it.1' })];
    const session = projectWhisperSessionView({
      decisions,
      historySnapshot: store.getSnapshot(),
      clock,
    });
    expect(session.activeDecisions.map((d) => d.decisionId)).toEqual(['d.1']);
    expect(session.projections[0].projectionReason).toBe('seen_no_suppression');
  });

  it('open_audit / open_evidence do not hold/remove the card', () => {
    const store = emptyStore();
    const clock = new FakeWhisperClock(BASE_MS);
    recordWhisperInteraction({
      intent: {
        intentId: 'oa',
        interactionType: 'open_audit',
        targetType: 'item',
        targetId: 'it.1',
      },
      clock,
      historyStore: store,
    });
    const decisions = [view({ decisionId: 'd.1', targetId: 'it.1' })];
    const session = projectWhisperSessionView({
      decisions,
      historySnapshot: store.getSnapshot(),
      clock,
    });
    expect(session.activeDecisions.map((d) => d.decisionId)).toEqual(['d.1']);
    expect(session.projections[0].projectionReason).toBe('open_audit_no_suppression');
  });

  it('suppress decisions are inspection-only, never active', () => {
    const decisions = [
      view({ decisionId: 'd.sup', level: 'suppress' }),
      view({ decisionId: 'd.1' }),
    ];
    const session = projectWhisperSessionView({
      decisions,
      historySnapshot: emptyStore().getSnapshot(),
      clock: fixedWhisperClock(BASE_MS),
    });
    expect(session.activeDecisions.map((d) => d.decisionId)).toEqual(['d.1']);
    expect(session.inspectionOnlyDecisions.map((d) => d.decisionId)).toEqual(['d.sup']);
    expect(session.projections.find((p) => p.decisionId === 'd.sup')?.projectionReason).toBe(
      'suppressed_inspection_only',
    );
  });

  it('does not mutate the input views', () => {
    const decisions = [view({ decisionId: 'd.1', targetId: 'it.1' })];
    const before = JSON.stringify(decisions);
    projectWhisperSessionView({
      decisions,
      historySnapshot: emptyStore().getSnapshot(),
      clock: fixedWhisperClock(BASE_MS),
    });
    expect(JSON.stringify(decisions)).toBe(before);
    expect(Object.isFrozen(decisions[0])).toBe(true);
  });

  it('returns a frozen session view (arrays + projections frozen)', () => {
    const session = projectWhisperSessionView({
      decisions: [view()],
      historySnapshot: emptyStore().getSnapshot(),
      clock: fixedWhisperClock(BASE_MS),
    });
    expect(Object.isFrozen(session)).toBe(true);
    expect(Object.isFrozen(session.activeDecisions)).toBe(true);
    expect(Object.isFrozen(session.heldByInteraction)).toBe(true);
    expect(Object.isFrozen(session.projections)).toBe(true);
    expect(session.projections.every((p) => Object.isFrozen(p))).toBe(true);
  });

  it('uses the injected clock for generatedAt and appends nothing to history', () => {
    const store = emptyStore();
    dismiss(store, new FakeWhisperClock(BASE_MS), 'it.x');
    const dBefore = store.dismissalCount;
    const iBefore = store.interactionCount;
    const session = projectWhisperSessionView({
      decisions: [view()],
      historySnapshot: store.getSnapshot(),
      clock: fixedWhisperClock(BASE_MS),
    });
    expect(session.generatedAt).toBe(new Date(BASE_MS).toISOString());
    expect(store.dismissalCount).toBe(dBefore);
    expect(store.interactionCount).toBe(iBefore);
    expect(store.decisionCount).toBe(0);
  });

  it('the projection source never calls the engine or the interaction action', () => {
    const code = readFileSync(
      resolve(repoRoot, 'src/domain/whispers/projectWhisperSessionView.ts'),
      'utf8',
    );
    expect(code).not.toMatch(/evaluateWhisperCandidate/);
    expect(code).not.toMatch(/recordWhisperInteraction/);
    expect(code).not.toMatch(/selectWhisperDecisions/);
    expect(code).not.toMatch(/append(Decision|Dismissal|Interaction)/);
    expect(code).not.toMatch(/Date\.now\s*\(|new Date\s*\(\s*\)/);
  });
});

describe('B. session controller', () => {
  const baseViews = [
    view({ decisionId: 'd.1', targetId: 'it.1' }),
    view({ decisionId: 'd.2', targetId: 'it.2' }),
    view({ decisionId: 'd.sup', targetId: 'it.3', level: 'suppress' }),
  ];
  const make = (): {
    controller: WhisperSessionController;
    store: InMemoryWhisperHistoryStore;
    clock: FakeWhisperClock;
  } => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    const controller = createWhisperSessionController({ baseViews, historyStore: store, clock });
    return { controller, store, clock };
  };

  it('initial session view is computed from base views + history (active excludes suppress)', () => {
    const { controller } = make();
    const s = controller.getSessionView();
    expect(s.activeDecisions.map((d) => d.decisionId)).toEqual(['d.1', 'd.2']);
    expect(s.inspectionOnlyDecisions.map((d) => d.decisionId)).toEqual(['d.sup']);
  });

  it('Dismiss records a dismissal and recompute removes the card from active (no local state)', () => {
    const { controller, store } = make();
    const s = controller.dismiss(idOf(baseViews[0]));
    expect(store.dismissalCount).toBe(1);
    expect(s.activeDecisions.map((d) => d.decisionId)).toEqual(['d.2']);
    expect(s.heldByInteraction.map((d) => d.decisionId)).toEqual(['d.1']);
  });

  it('Mark seen appends an interaction but the card stays active', () => {
    const { controller, store } = make();
    const s = controller.markSeen(idOf(baseViews[0]));
    expect(store.interactionCount).toBe(1);
    expect(store.dismissalCount).toBe(0);
    expect(s.activeDecisions.map((d) => d.decisionId)).toEqual(['d.1', 'd.2']);
  });

  it('Open audit / Open evidence append interactions but cards stay active', () => {
    const { controller, store } = make();
    controller.openAudit(idOf(baseViews[0]));
    const s = controller.openEvidence(idOf(baseViews[1]));
    expect(store.interactionCount).toBe(2);
    expect(store.dismissalCount).toBe(0);
    expect(s.activeDecisions.map((d) => d.decisionId)).toEqual(['d.1', 'd.2']);
  });

  it('recompute without a user action appends nothing (and never runs the engine)', () => {
    const { controller, store } = make();
    controller.getSessionView();
    controller.getSessionView();
    controller.getSessionView();
    expect(store.dismissalCount).toBe(0);
    expect(store.interactionCount).toBe(0);
    expect(store.decisionCount).toBe(0);
  });

  it('repeated dismiss during the quiet window is idempotent and does not extend quietUntil', () => {
    const { controller, store, clock } = make();
    controller.dismiss(idOf(baseViews[0]));
    const quietUntil = store.getSnapshot().dismissalRecords[0].quietUntil;
    clock.advanceMinutes(30);
    controller.dismiss(idOf(baseViews[0]));
    expect(store.dismissalCount).toBe(1);
    expect(store.getSnapshot().dismissalRecords[0].quietUntil).toBe(quietUntil);
  });

  it('advancing the clock beyond the quiet window returns the card to active', () => {
    const { controller, store, clock } = make();
    controller.dismiss(idOf(baseViews[0]));
    expect(controller.getSessionView().activeDecisions.map((d) => d.decisionId)).toEqual(['d.2']);
    clock.advanceMinutes(DISMISSAL_QUIET_WINDOW_MINUTES + 1);
    const s = controller.getSessionView();
    expect(s.activeDecisions.map((d) => d.decisionId)).toEqual(['d.1', 'd.2']);
    expect(s.heldByInteraction).toEqual([]);
    expect(store.decisionCount).toBe(0);
  });

  it('the controller/bridge source holds no local dismissed/seen id maps', () => {
    const code = readFileSync(
      resolve(repoRoot, 'src/fixtures/whispers/whisperSessionBootstrap.ts'),
      'utf8',
    );
    expect(code).not.toMatch(/dismissedIds|seenIds|hiddenIds/);
    expect(code).not.toMatch(/evaluateWhisperCandidate/);
  });
});
