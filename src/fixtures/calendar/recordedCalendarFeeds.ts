import cleanJson from './economic-calendar-clean.json?raw';
import changedV1Json from './economic-calendar-changed-time-v1.json?raw';
import changedV2Json from './economic-calendar-changed-time-v2.json?raw';
import cancelledJson from './economic-calendar-cancelled.json?raw';
import actualAddedJson from './economic-calendar-actual-added.json?raw';
import malformedJson from './economic-calendar-malformed.json?raw';
import type { CalendarFeedKey } from './calendarSources';

export const RECORDED_CALENDAR_JSON: Record<CalendarFeedKey, string> = {
  clean: cleanJson,
  changedV1: changedV1Json,
  changedV2: changedV2Json,
  cancelled: cancelledJson,
  actualAdded: actualAddedJson,
  malformed: malformedJson,
};
