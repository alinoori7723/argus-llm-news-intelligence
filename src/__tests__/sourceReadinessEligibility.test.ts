import { describe, expect, it } from 'vitest';
import {
  SOURCE_READINESS_RULE_VERSION,
  evaluateSourceReadinessEligibility,
  type SourceReadinessProfile,
} from '@/domain/sourceReadiness';

const ready = (over: Partial<SourceReadinessProfile> = {}): SourceReadinessProfile => ({
  sourceId: 'src.rss.example',
  sourceName: 'Example RSS',
  sourceKind: 'rss',
  enabled: true,
  legalStatus: 'allowed',
  tosStatus: 'allowed',
  acquisitionMode: 'recorded_fixture',
  parserSupport: 'supported',
  maxPayloadBytes: 1_000_000,
  allowedContentTypes: ['application/rss+xml', 'application/xml'],
  timeoutMs: 5_000,
  retryPolicyId: 'retry-policy-default-v1',
  ...over,
});

describe('A. evaluateSourceReadinessEligibility (positive-proof pre-fetch gate)', () => {
  it('a fully-proven source is eligible', () => {
    const d = evaluateSourceReadinessEligibility(ready());
    expect(d.status).toBe('eligible');
    expect(d.skipReason).toBeUndefined();
    expect(d.ruleVersion).toBe(SOURCE_READINESS_RULE_VERSION);
  });

  const skips: Array<[string, Partial<SourceReadinessProfile>, string]> = [
    ['disabled', { enabled: false }, 'source_disabled'],
    [
      'enabled not boolean true',
      { enabled: undefined as unknown as boolean },
      'source_not_enabled',
    ],
    ['missing legal status', { legalStatus: undefined as never }, 'source_missing_legal_status'],
    ['legal needs_review', { legalStatus: 'needs_review' }, 'source_legal_needs_review'],
    ['legal blocked', { legalStatus: 'blocked' }, 'source_legal_blocked'],
    ['legal unknown', { legalStatus: 'unknown' }, 'source_legal_unknown'],
    ['missing tos status', { tosStatus: undefined as never }, 'tos_missing'],
    ['tos needs_review', { tosStatus: 'needs_review' }, 'tos_needs_review'],
    ['tos blocked', { tosStatus: 'blocked' }, 'tos_blocked'],
    ['tos unknown', { tosStatus: 'unknown' }, 'tos_unknown'],
    ['unsupported parser', { parserSupport: 'unsupported' }, 'parser_unsupported'],
    ['unknown parser', { parserSupport: 'unknown' }, 'parser_unsupported'],
    [
      'live_fetch_deferred',
      { acquisitionMode: 'live_fetch_deferred' },
      'acquisition_mode_not_offline_ready',
    ],
    ['no content types', { allowedContentTypes: [] }, 'content_type_unsupported'],
    ['missing maxPayloadBytes', { maxPayloadBytes: undefined }, 'max_payload_missing'],
    [
      'non-finite maxPayloadBytes',
      { maxPayloadBytes: Number.POSITIVE_INFINITY },
      'max_payload_missing',
    ],
    ['missing timeoutMs', { timeoutMs: undefined }, 'timeout_missing'],
    ['zero timeoutMs', { timeoutMs: 0 }, 'timeout_missing'],
  ];

  for (const [label, over, reason] of skips) {
    it(`skips: ${label} → ${reason}`, () => {
      const d = evaluateSourceReadinessEligibility(ready(over));
      expect(d.status).toBe('skipped');
      expect(d.skipReason).toBe(reason);
    });
  }

  it('first-failure-wins is deterministic (legal checked before tos)', () => {
    const d = evaluateSourceReadinessEligibility(
      ready({ legalStatus: 'blocked', tosStatus: 'blocked' }),
    );
    expect(d.skipReason).toBe('source_legal_blocked');
  });

  it('manual_recording_ready is also offline-eligible', () => {
    expect(
      evaluateSourceReadinessEligibility(ready({ acquisitionMode: 'manual_recording_ready' }))
        .status,
    ).toBe('eligible');
  });
});
