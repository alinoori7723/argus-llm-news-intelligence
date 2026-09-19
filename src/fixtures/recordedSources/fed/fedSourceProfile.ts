import type { SourceReadinessProfile } from '@/domain/sourceReadiness';

export const FED_PRESS_ALL_SOURCE_ID = 'fed_press_all';
export const FED_PRESS_ALL_FEED_URL = 'https://www.federalreserve.gov/feeds/press_all.xml';

export const FED_PRESS_ALL_READINESS_PROFILE: SourceReadinessProfile = {
  sourceId: FED_PRESS_ALL_SOURCE_ID,
  sourceName: 'Federal Reserve Board — All Press Releases RSS',
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
  sourceUrl: FED_PRESS_ALL_FEED_URL,
  sourceAuthority: 'official_primary_source',
  legalEvidenceNote:
    'Official Federal Reserve Board RSS feed page lists "All Press Releases" and ' +
    'describes RSS reader/subscription usage. Recorded once for offline development; ' +
    'no automatic polling.',
  notes: 'First real recorded feed (Phase 2.11). Recorded-fixture-only; no live ingestion.',
};

export const FED_PRESS_ALL_FIXTURE_PATHS = {
  xml: 'src/fixtures/recordedSources/fed/press_all.rss.xml',
  meta: 'src/fixtures/recordedSources/fed/press_all.meta.json',
} as const;
