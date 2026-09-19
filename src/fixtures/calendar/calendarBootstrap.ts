import {
  activeUpcomingViews,
  calendarEventViews,
  promotableScheduledViews,
  type CalendarEventView,
  type CalendarStore,
} from '@/domain/calendar';
import { deepFreeze } from '@/domain/persistence';
import {
  DEMO_VIEW_INSTANT,
  buildCleanCalendarStore,
  buildRichCalendarStore,
  viewNow,
} from './demoCalendar';

export const CALENDAR_DEMO_VIEW_INSTANT = DEMO_VIEW_INSTANT;

export const calendarRichBootstrapStore: CalendarStore = buildRichCalendarStore();
export const calendarCleanBootstrapStore: CalendarStore = buildCleanCalendarStore();

const NOW = viewNow();

const freezeViews = (views: readonly CalendarEventView[]): readonly CalendarEventView[] =>
  Object.freeze(views.map((v) => deepFreeze(v)));

export const CALENDAR_RICH_EVENT_VIEWS: readonly CalendarEventView[] = freezeViews(
  calendarEventViews(calendarRichBootstrapStore, NOW),
);

export const CALENDAR_CLEAN_ACTIVE_UPCOMING_VIEWS: readonly CalendarEventView[] = freezeViews(
  activeUpcomingViews(calendarCleanBootstrapStore, NOW),
);

export const CALENDAR_CLEAN_PROMOTABLE_VIEWS: readonly CalendarEventView[] = freezeViews(
  promotableScheduledViews(calendarCleanBootstrapStore, NOW),
);
