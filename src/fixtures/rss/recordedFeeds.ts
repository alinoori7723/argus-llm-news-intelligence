import cleanXml from './clean-market-feed.xml?raw';
import malformedXml from './malformed-market-feed.xml?raw';
import missingPubdateXml from './missing-pubdate-feed.xml?raw';
import futurePubdateXml from './future-pubdate-feed.xml?raw';
import brokenXml from './broken-xml-feed.xml?raw';
import { DEV_INGESTION_SOURCES, type RecordedFeedKey } from './ingestionSources';
import type { RecordedPayload } from '@/ingestion/fetchers/recordedFixtureFetcher';

export const RECORDED_FEED_XML: Record<RecordedFeedKey, string> = {
  clean: cleanXml,
  malformed: malformedXml,
  missingPubdate: missingPubdateXml,
  futurePubdate: futurePubdateXml,
  brokenXml,
};

export const recordedPayloadsBySourceId = (): Record<string, RecordedPayload> => {
  const map: Record<string, RecordedPayload> = {};
  for (const dev of DEV_INGESTION_SOURCES) {
    map[dev.source.sourceId] = {
      xml: RECORDED_FEED_XML[dev.feedKey],
      contentType: 'application/rss+xml',
      sourceUrl: `https://example.invalid/fixture/${dev.feedKey}`,
    };
  }
  return map;
};
