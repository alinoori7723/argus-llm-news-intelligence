import {
  PersistenceBackedWhisperHistoryStore,
  fixedWhisperClock,
  selectWhisperDecisions,
  type WhisperDecisionView,
} from '@/domain/whispers';
import { InMemoryAppendOnlyPersistenceStore } from '@/domain/persistence';
import { FIXTURE_SNAPSHOT, FIXTURE_NOW } from '@/fixtures/snapshot';
import { activeUpcomingViews } from '@/domain/calendar';
import {
  buildCleanCalendarStore,
  DEMO_VIEW_INSTANT,
  viewNow,
} from '@/fixtures/calendar/demoCalendar';
import { calendarSourceById } from '@/fixtures/calendar/calendarSources';

const calendarSource = calendarSourceById('src.cal.fixture');

function deepFreezeWhisperDecisionView(view: WhisperDecisionView): WhisperDecisionView {
  for (const value of Object.values(view)) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
    }
  }
  return Object.freeze(view);
}

function freezeWhisperDecisionViews(views: WhisperDecisionView[]): readonly WhisperDecisionView[] {
  return Object.freeze(views.map(deepFreezeWhisperDecisionView));
}

export const whisperBootstrapStore = new PersistenceBackedWhisperHistoryStore(
  new InMemoryAppendOnlyPersistenceStore(),
);

const VIEWS: WhisperDecisionView[] = selectWhisperDecisions({
  snapshot: FIXTURE_SNAPSHOT,
  now: new Date(FIXTURE_NOW),
  clock: fixedWhisperClock(Date.parse(DEMO_VIEW_INSTANT)),
  historyStore: whisperBootstrapStore,
  calendar: {
    views: activeUpcomingViews(buildCleanCalendarStore(), viewNow()),
    sourceLegalStatus: calendarSource.legalStatus,
    sourceEnabled: calendarSource.enabled,
  },
});

export const WHISPER_DECISION_VIEWS: readonly WhisperDecisionView[] =
  freezeWhisperDecisionViews(VIEWS);

export const WHISPER_BOOTSTRAP_DECISION_COUNT = whisperBootstrapStore.decisionCount;
