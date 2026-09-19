import type { SourceProfile } from '@/domain/types';

export type CalendarFeedKey =
  | 'clean'
  | 'changedV1'
  | 'changedV2'
  | 'cancelled'
  | 'actualAdded'
  | 'malformed';

export interface DevCalendarSource {
  source: SourceProfile;
  feedKey: CalendarFeedKey;
}

const calSource = (
  sourceId: string,
  name: string,
  legalStatus: SourceProfile['legalStatus'],
  enabled: boolean,
  extra: Partial<SourceProfile> = {},
): SourceProfile => ({
  sourceId,
  name,
  sourceType: 'economic_calendar_fixture',
  accessMethod: 'recorded-fixture-json',
  legalStatus,
  enabled,
  sourceTier: 'reputable',
  trustNotes:
    'Recorded economic-calendar fixture source for Phase 2.2. Sample data only; not live calendar data.',
  freshnessExpectation: 'recorded snapshot only',
  defaultAssetTags: [],
  defaultTopicTags: ['macro'],
  ...extra,
});

export const DEV_CALENDAR_SOURCES: DevCalendarSource[] = [
  {
    source: calSource('src.cal.fixture', 'Sample Economic Calendar (fixture)', 'allowed', true),
    feedKey: 'clean',
  },
  {
    source: calSource(
      'src.cal.review',
      'Sample Calendar Needs-Review (fixture)',
      'needs_review',
      true,
      { sourceTier: 'unknown' },
    ),
    feedKey: 'clean',
  },
  {
    source: calSource('src.cal.disabled', 'Sample Calendar Disabled (fixture)', 'disabled', false, {
      sourceTier: 'experimental',
    }),
    feedKey: 'clean',
  },
];

export const DEV_CALENDAR_SOURCE_LIST: SourceProfile[] = DEV_CALENDAR_SOURCES.map((d) => d.source);

export const calendarSourceById = (sourceId: string): SourceProfile =>
  DEV_CALENDAR_SOURCE_LIST.find((s) => s.sourceId === sourceId)!;
