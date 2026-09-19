import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AppendOnlyIngestionStore,
  RSS_PARSER_VERSION,
  fixedClock,
  parseRss,
  runRecordedIngestion,
} from '@/domain/ingestion';
import type { SourceProfile } from '@/domain/types';

const NOW = fixedClock('2026-05-29T12:00:00.000Z').now();
const OBSERVED_AT = '2026-05-29T11:59:00.000Z';

const readFixture = (name: string) =>
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/rss', name), 'utf8');

const allowedSource: SourceProfile = {
  sourceId: 'src.rss.malformed',
  name: 'Sample Malformed RSS (fixture)',
  sourceType: 'rss_fixture',
  accessMethod: 'recorded-fixture-xml',
  legalStatus: 'allowed',
  enabled: true,
  sourceTier: 'reputable',
  trustNotes: '',
  freshnessExpectation: '',
  defaultAssetTags: [],
  defaultTopicTags: [],
};

describe('E. malformed item quarantine', () => {
  const result = parseRss(readFixture('malformed-market-feed.xml'), {
    sourceId: 'src.rss.malformed',
    rawPayloadId: 'raw-mal-1',
    observedAt: OBSERVED_AT,
    now: NOW,
  });

  it('an item missing a title is quarantined', () => {
    const reasons = result.malformedItems.map((m) => m.reason);
    expect(reasons).toContain('missing_title');
  });

  it('an item missing identity (no guid AND no link) is quarantined', () => {
    const reasons = result.malformedItems.map((m) => m.reason);
    expect(reasons).toContain('missing_identity');
  });

  it('malformed records carry parserVersion, observedAt, and quarantinedAt', () => {
    expect(result.malformedItems.length).toBeGreaterThan(0);
    for (const m of result.malformedItems) {
      expect(m.parserVersion).toBe(RSS_PARSER_VERSION);
      expect(m.observedAt).toBe(OBSERVED_AT);
      expect(m.quarantinedAt).toBe('2026-05-29T12:00:00.000Z');
      expect(m.rawPayloadId).toBe('raw-mal-1');
      expect(m.rawSnippet.length).toBeGreaterThan(0);
    }
  });

  it('the parse still yields usable items (partial), it does not throw', () => {
    expect(result.ok).toBe(true);
    expect(result.parsedItems.length).toBeGreaterThan(0);
  });
});

describe('E. malformed XML produces a failed ingestion run (no crash)', () => {
  it('broken XML ⇒ parse ok:false', () => {
    const parsed = parseRss(readFixture('broken-xml-feed.xml'), {
      sourceId: 'src.rss.malformed',
      rawPayloadId: 'raw-broken-1',
      observedAt: OBSERVED_AT,
      now: NOW,
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.parsedItems).toHaveLength(0);
    expect(parsed.warnings.some((w) => w.code === 'malformed_xml')).toBe(true);
  });

  it('broken XML through the orchestrator ⇒ failed run, payload quarantined, no throw', () => {
    const store = new AppendOnlyIngestionStore();
    let run;
    expect(() => {
      run = runRecordedIngestion({
        source: allowedSource,
        payloadText: readFixture('broken-xml-feed.xml'),
        fetcherVersion: 'recorded-fixture-fetcher-v1',
        store,
        clock: fixedClock('2026-05-29T12:00:00.000Z'),
      });
    }).not.toThrow();
    expect(run!.status).toBe('failed');
    expect(run!.failureReason).toBe('malformed_xml');
    expect(store.normalizedItems).toHaveLength(0);

    expect(store.rawPayloads).toHaveLength(1);
    expect(store.rawPayloads[0].status).toBe('quarantined');
  });

  it('a quarantined raw payload record is self-versioned (carries parserVersion)', () => {
    const store = new AppendOnlyIngestionStore();
    const run = runRecordedIngestion({
      source: allowedSource,
      payloadText: readFixture('broken-xml-feed.xml'),
      fetcherVersion: 'recorded-fixture-fetcher-v1',
      store,
      clock: fixedClock('2026-05-30T12:00:00.000Z'),
    });
    const quarantined = store.rawPayloads.find((p) => p.status === 'quarantined')!;
    expect(quarantined).toBeDefined();
    expect(quarantined.parserVersion).toBe(RSS_PARSER_VERSION);

    expect(quarantined.parserVersion).toBe(run.parserVersion);
  });
});
