import type { SourceReadinessProfile } from '@/domain/sourceReadiness';
import type { SourceProfile } from '@/domain/types';

export interface FedFeedDescriptor {
  sourceId: string;
  sourceName: string;
  feedUrl: string;
  fixturePaths: { xml: string; meta: string };

  readinessProfile: SourceReadinessProfile;

  ingestionProfile: SourceProfile;
}

const FIXTURE_DIR = 'src/fixtures/recordedSources/fed';

const makeReadinessProfile = (
  sourceId: string,
  sourceName: string,
  feedUrl: string,
  legalEvidenceNote: string,
): SourceReadinessProfile => ({
  sourceId,
  sourceName,
  sourceKind: 'rss',
  enabled: true,

  legalStatus: 'allowed',
  tosStatus: 'allowed',

  acquisitionMode: 'manual_recording_ready',
  runtimeMode: 'recorded_fixture_only',
  parserSupport: 'supported',
  maxPayloadBytes: 5_000_000,
  allowedContentTypes: ['application/rss+xml', 'application/xml', 'text/xml'],
  timeoutMs: 30_000,
  retryPolicyId: 'retry-policy-default-v1',
  sourceUrl: feedUrl,
  sourceAuthority: 'official_primary_source',
  legalEvidenceNote,
  notes: 'Phase 2.12 recorded Fed feed. Recorded-fixture-only; no live ingestion.',
});

const makeIngestionProfile = (sourceId: string, name: string): SourceProfile => ({
  sourceId,
  name,
  sourceType: 'rss_fixture',
  accessMethod: 'recorded_fixture',
  legalStatus: 'allowed',
  enabled: true,
  sourceTier: 'primary',
  trustNotes: 'Official Federal Reserve press content (recorded fixture).',
  freshnessExpectation: 'irregular',
  defaultAssetTags: [],
  defaultTopicTags: [],
});

export const FED_MONETARY_POLICY: FedFeedDescriptor = {
  sourceId: 'fed_monetary_policy',
  sourceName: 'Federal Reserve Board — Monetary Policy RSS',
  feedUrl: 'https://www.federalreserve.gov/feeds/press_monetary.xml',
  fixturePaths: {
    xml: `${FIXTURE_DIR}/monetary_policy.rss.xml`,
    meta: `${FIXTURE_DIR}/monetary_policy.meta.json`,
  },
  readinessProfile: makeReadinessProfile(
    'fed_monetary_policy',
    'Federal Reserve Board — Monetary Policy RSS',
    'https://www.federalreserve.gov/feeds/press_monetary.xml',
    'Official Federal Reserve Board RSS feed page lists "Monetary Policy" under ' +
      'Press Releases and describes RSS reader/subscription usage. Recorded once for ' +
      'offline development; no automatic polling.',
  ),
  ingestionProfile: makeIngestionProfile(
    'fed_monetary_policy',
    'Federal Reserve Board — Monetary Policy RSS',
  ),
};

export const FED_ALL_SPEECHES: FedFeedDescriptor = {
  sourceId: 'fed_all_speeches',
  sourceName: 'Federal Reserve Board — All Speeches RSS',
  feedUrl: 'https://www.federalreserve.gov/feeds/speeches.xml',
  fixturePaths: {
    xml: `${FIXTURE_DIR}/all_speeches.rss.xml`,
    meta: `${FIXTURE_DIR}/all_speeches.meta.json`,
  },
  readinessProfile: makeReadinessProfile(
    'fed_all_speeches',
    'Federal Reserve Board — All Speeches RSS',
    'https://www.federalreserve.gov/feeds/speeches.xml',
    'Official Federal Reserve Board RSS feed page lists "All Speeches" under ' +
      'Speeches & Testimony and describes RSS reader/subscription usage. Recorded once ' +
      'for offline development; no automatic polling.',
  ),
  ingestionProfile: makeIngestionProfile(
    'fed_all_speeches',
    'Federal Reserve Board — All Speeches RSS',
  ),
};

export const FED_ALL_TESTIMONY: FedFeedDescriptor = {
  sourceId: 'fed_all_testimony',
  sourceName: 'Federal Reserve Board — All Testimony RSS',
  feedUrl: 'https://www.federalreserve.gov/feeds/testimony.xml',
  fixturePaths: {
    xml: `${FIXTURE_DIR}/all_testimony.rss.xml`,
    meta: `${FIXTURE_DIR}/all_testimony.meta.json`,
  },
  readinessProfile: makeReadinessProfile(
    'fed_all_testimony',
    'Federal Reserve Board — All Testimony RSS',
    'https://www.federalreserve.gov/feeds/testimony.xml',
    'Official Federal Reserve Board RSS feed page lists "All Testimony" under ' +
      'Speeches & Testimony and describes RSS reader/subscription usage. Recorded once ' +
      'for offline development; no automatic polling.',
  ),
  ingestionProfile: makeIngestionProfile(
    'fed_all_testimony',
    'Federal Reserve Board — All Testimony RSS',
  ),
};

export const FED_MULTI_FEEDS: readonly FedFeedDescriptor[] = [
  FED_MONETARY_POLICY,
  FED_ALL_SPEECHES,
  FED_ALL_TESTIMONY,
];
