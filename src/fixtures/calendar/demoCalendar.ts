import { fixedClock } from '@/domain/ingestion';
import {
  PersistenceBackedCalendarStore,
  runRecordedCalendarIngestion,
  type CalendarStore,
} from '@/domain/calendar';
import { InMemoryAppendOnlyPersistenceStore } from '@/domain/persistence';
import { RECORDED_CALENDAR_JSON } from './recordedCalendarFeeds';
import { calendarSourceById, type CalendarFeedKey } from './calendarSources';

export const DEMO_VIEW_INSTANT = '2026-05-30T12:00:00.000Z';

export const DEMO_RICH_OBSERVED_INSTANT = '2026-05-30T10:00:00.000Z';

const RECORDED_FETCHER_VERSION = 'recorded-fixture-fetcher-v1';

export const viewNow = (instant: string = DEMO_VIEW_INSTANT): Date => fixedClock(instant).now();

const buildStore = (feedKeys: CalendarFeedKey[], observedInstant: string): CalendarStore => {
  const store = new PersistenceBackedCalendarStore(new InMemoryAppendOnlyPersistenceStore());
  const clock = fixedClock(observedInstant);
  const source = calendarSourceById('src.cal.fixture');
  for (const key of feedKeys) {
    runRecordedCalendarIngestion({
      source,
      payloadText: RECORDED_CALENDAR_JSON[key],
      fetcherVersion: RECORDED_FETCHER_VERSION,
      store,
      clock,
    });
  }
  return store;
};

export const buildCleanCalendarStore = (): CalendarStore =>
  buildStore(['clean'], DEMO_VIEW_INSTANT);

export const buildRichCalendarStore = (): CalendarStore =>
  buildStore(['clean', 'changedV2', 'cancelled', 'actualAdded'], DEMO_RICH_OBSERVED_INSTANT);
