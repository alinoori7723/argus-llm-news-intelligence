import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  InMemoryWhisperHistoryStore,
  fixedWhisperClock,
  selectWhisperDecisions,
} from '@/domain/whispers';
import { FIXTURE_SNAPSHOT, FIXTURE_NOW } from '@/fixtures/snapshot';
import { activeUpcomingViews } from '@/domain/calendar';
import {
  buildCleanCalendarStore,
  DEMO_VIEW_INSTANT,
  viewNow,
} from '@/fixtures/calendar/demoCalendar';
import { calendarSourceById } from '@/fixtures/calendar/calendarSources';
import type { FixtureSnapshot, SourceProfile } from '@/domain/types';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLOCK_MS = Date.parse(DEMO_VIEW_INSTANT);

const run = (snapshot: FixtureSnapshot, withCalendar = false) => {
  const store = new InMemoryWhisperHistoryStore();
  const views = selectWhisperDecisions({
    snapshot,
    now: new Date(FIXTURE_NOW),
    clock: fixedWhisperClock(CLOCK_MS),
    historyStore: store,
    calendar: withCalendar
      ? {
          views: activeUpcomingViews(buildCleanCalendarStore(), viewNow()),
          sourceLegalStatus: calendarSourceById('src.cal.fixture').legalStatus,
          sourceEnabled: calendarSourceById('src.cal.fixture').enabled,
        }
      : undefined,
  });
  return { store, views };
};

describe('1. selectWhisperDecisions boundary', () => {
  it('returns WhisperDecisionView[] and runs the engine once per candidate', () => {
    const { store, views } = run(FIXTURE_SNAPSHOT);
    expect(views.length).toBeGreaterThan(0);
    expect(store.decisionCount).toBe(views.length);
    for (const v of views) {
      expect(v.ruleVersion).toBe('whisper-rule-v1');
      expect(['glow', 'whisper', 'hold', 'suppress']).toContain(v.level);
    }
  });

  it('reuses the Phase 2.6 engine (no reimplementation of caps/eligibility)', () => {
    const code = readFileSync(
      resolve(repoRoot, 'src/domain/whispers/selectWhisperDecisions.ts'),
      'utf8',
    );
    expect(code).toMatch(/evaluateWhisperCandidate/);

    expect(code).not.toMatch(/MAX_WHISPERS_PER|MIN_COOLDOWN|whispersLast15m|hardExclusions/);
  });

  it('cluster-backed views use ConfirmedClusterDisplay (count + clusterRuleVersion)', () => {
    const { views } = run(FIXTURE_SNAPSHOT);
    const cluster = views.find((v) => v.clusterId !== undefined);
    expect(cluster).toBeDefined();
    expect(cluster!.confirmedMemberCount).toBeGreaterThanOrEqual(2);
    expect(cluster!.clusterRuleVersion).toBe('cluster-rule-v1');
  });

  it('calendar-backed views use CalendarConfirmationDisplay (scheduledFor + state)', () => {
    const { views } = run(FIXTURE_SNAPSHOT, true);
    const cal = views.find((v) => v.scheduledFor != null);
    expect(cal).toBeDefined();
    expect(cal!.confirmationState).toBeTruthy();
  });

  it('only positive-proof (allowed + enabled) sources yield candidates', () => {
    const allowed: SourceProfile = {
      sourceId: 'src.ok',
      name: 'OK',
      sourceType: 'rss_fixture',
      accessMethod: 'recorded',
      legalStatus: 'allowed',
      enabled: true,
      sourceTier: 'reputable',
      trustNotes: '',
      freshnessExpectation: '',
      defaultAssetTags: [],
      defaultTopicTags: [],
    };
    const needsReview: SourceProfile = {
      ...allowed,
      sourceId: 'src.bad',
      legalStatus: 'needs_review',
    };
    const mk = (id: string, sourceId: string) => ({
      itemId: id,
      sourceId,
      sourceItemId: `evt-${id}`,
      sourceEventTime: '2026-05-28T12:00:00.000Z',
      observedAt: '2026-05-28T12:50:00.000Z',
      ingestedAt: '2026-05-28T12:50:00.000Z',
      title: 'Headline',
      excerpt: '',
      url: `https://h/${id}`,
      language: 'en',
      tags: [],
      verificationTier: 'reported' as const,
      freshnessState: 'live' as const,
      dedupeHash: `h.${id}`,
    });
    const snap: FixtureSnapshot = {
      generatedAt: new Date(FIXTURE_NOW).toISOString(),
      sources: [allowed, needsReview],
      items: [mk('it.ok', 'src.ok'), mk('it.bad', 'src.bad')],
      clusters: [],
    };
    const { store } = run(snap);

    expect(store.decisionCount).toBe(1);
    const rec = store.getSnapshot().decisionRecords[0];
    expect(rec.sourceId).toBe('src.ok');
    expect(rec.decision).not.toBe('suppress');
  });
});
