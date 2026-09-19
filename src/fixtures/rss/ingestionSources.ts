import type { SourceProfile } from '@/domain/types';

export type RecordedFeedKey =
  | 'clean'
  | 'malformed'
  | 'missingPubdate'
  | 'futurePubdate'
  | 'brokenXml';

export interface DevIngestionSource {
  source: SourceProfile;
  feedKey: RecordedFeedKey;
}

const rssSource = (
  sourceId: string,
  name: string,
  legalStatus: SourceProfile['legalStatus'],
  enabled: boolean,
  extra: Partial<SourceProfile> = {},
): SourceProfile => ({
  sourceId,
  name,
  sourceType: 'rss_fixture',
  accessMethod: 'recorded-fixture-xml',
  legalStatus,
  enabled,
  sourceTier: 'reputable',
  trustNotes:
    'Recorded RSS fixture source for Phase 2.1 deterministic ingestion. Sample data only; not live news.',
  freshnessExpectation: 'recorded snapshot only',
  defaultAssetTags: [],
  defaultTopicTags: ['macro'],
  ...extra,
});

export const DEV_INGESTION_SOURCES: DevIngestionSource[] = [
  {
    source: rssSource('src.rss.clean', 'Sample Clean RSS (fixture)', 'allowed', true, {
      sourceTier: 'reputable',
      defaultAssetTags: ['Gold', 'DXY'],
    }),
    feedKey: 'clean',
  },
  {
    source: rssSource('src.rss.malformed', 'Sample Malformed RSS (fixture)', 'allowed', true),
    feedKey: 'malformed',
  },
  {
    source: rssSource('src.rss.nopubdate', 'Sample Missing-PubDate RSS (fixture)', 'allowed', true),
    feedKey: 'missingPubdate',
  },
  {
    source: rssSource('src.rss.future', 'Sample Future-PubDate RSS (fixture)', 'allowed', true),
    feedKey: 'futurePubdate',
  },
  {
    source: rssSource('src.rss.review', 'Sample Needs-Review RSS (fixture)', 'needs_review', true, {
      sourceTier: 'unknown',
    }),
    feedKey: 'clean',
  },
  {
    source: rssSource('src.rss.disabled', 'Sample Disabled RSS (fixture)', 'disabled', false, {
      sourceTier: 'experimental',
    }),
    feedKey: 'clean',
  },
];

export const DEV_INGESTION_SOURCE_LIST: SourceProfile[] = DEV_INGESTION_SOURCES.map(
  (d) => d.source,
);

export const feedKeyForSource = (sourceId: string): RecordedFeedKey | undefined =>
  DEV_INGESTION_SOURCES.find((d) => d.source.sourceId === sourceId)?.feedKey;
