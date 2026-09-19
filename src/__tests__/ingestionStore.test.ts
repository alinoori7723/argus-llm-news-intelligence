import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AppendOnlyIngestionStore,
  INGESTION_PROCESSING_VERSION,
  RSS_PARSER_VERSION,
  buildIngestedSnapshot,
  fixedClock,
  normalizeParsedItems,
  parseRss,
  runIngestion,
  runIngestionBatch,
  type SourceFetcher,
} from '@/domain/ingestion';
import { RecordedFixtureFetcher } from '@/ingestion/fetchers/recordedFixtureFetcher';
import { DEV_INGESTION_SOURCES, DEV_INGESTION_SOURCE_LIST } from '@/fixtures/rss/ingestionSources';
import { ingestedItems, promotableItems } from '@/domain/selectors';
import type { SourceProfile } from '@/domain/types';

const CLOCK = fixedClock('2026-05-29T12:00:00.000Z');

const FIXTURE_FILE: Record<string, string> = {
  clean: 'clean-market-feed.xml',
  malformed: 'malformed-market-feed.xml',
  missingPubdate: 'missing-pubdate-feed.xml',
  futurePubdate: 'future-pubdate-feed.xml',
  brokenXml: 'broken-xml-feed.xml',
};

const readFixture = (name: string) =>
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/rss', name), 'utf8');

const recordedFetcher = (): SourceFetcher => {
  const payloads: Record<string, { xml: string }> = {};
  for (const dev of DEV_INGESTION_SOURCES) {
    payloads[dev.source.sourceId] = { xml: readFixture(FIXTURE_FILE[dev.feedKey]) };
  }
  return new RecordedFixtureFetcher(payloads);
};

const cleanSource = (): SourceProfile =>
  DEV_INGESTION_SOURCE_LIST.find((s) => s.sourceId === 'src.rss.clean')!;

describe('I. append-only store', () => {
  it('preserves prior raw payloads across multiple runs (no overwrite)', async () => {
    const store = new AppendOnlyIngestionStore();
    const fetcher = recordedFetcher();
    const r1 = await runIngestion({ source: cleanSource(), fetcher, store, clock: CLOCK });
    const firstPayloadId = store.rawPayloads[0].rawPayloadId;
    const firstPayloadCount = store.rawPayloads.length;

    const r2 = await runIngestion({ source: cleanSource(), fetcher, store, clock: CLOCK });

    expect(store.rawPayloads.length).toBe(firstPayloadCount + 1);

    expect(store.rawPayloads[0].rawPayloadId).toBe(firstPayloadId);
    expect(r1.rawPayloadIds[0]).not.toBe(r2.rawPayloadIds[0]);
    expect(store.runs).toHaveLength(2);
  });

  it('normalized items reference rawPayloadId, parserVersion, and processingVersion', async () => {
    const store = new AppendOnlyIngestionStore();
    await runIngestion({ source: cleanSource(), fetcher: recordedFetcher(), store, clock: CLOCK });
    expect(store.normalizedItems.length).toBeGreaterThan(0);
    const rawIds = new Set(store.rawPayloads.map((p) => p.rawPayloadId));
    for (const n of store.normalizedItems) {
      expect(rawIds.has(n.rawPayloadId)).toBe(true);
      expect(n.parserVersion).toBe(RSS_PARSER_VERSION);
      expect(n.processingVersion).toBe(INGESTION_PROCESSING_VERSION);
    }
  });
});

describe('normalize: deterministic timestamps + preserved sourceEventTime', () => {
  it('uses caller-provided observedAt/ingestedAt/normalizedAt and never backfills sourceEventTime', () => {
    const parsed = parseRss(readFixture('clean-market-feed.xml'), {
      sourceId: 'src.rss.clean',
      rawPayloadId: 'raw-clean-1',
      observedAt: '2026-05-29T11:59:00.000Z',
      now: CLOCK.now(),
    });
    const normalized = normalizeParsedItems(parsed.parsedItems, {
      source: cleanSource(),
      observedAt: '2026-05-29T11:59:00.000Z',
      ingestedAt: '2026-05-29T11:59:30.000Z',
      normalizedAt: '2026-05-29T11:59:45.000Z',
    });
    const sample = normalized[0];
    expect(sample.observedAt).toBe('2026-05-29T11:59:00.000Z');
    expect(sample.ingestedAt).toBe('2026-05-29T11:59:30.000Z');
    expect(sample.normalizedAt).toBe('2026-05-29T11:59:45.000Z');

    expect(sample.sourceEventTime).toBe('2026-05-28T09:30:00.000Z');
    expect(sample.sourceEventTimeStatus).toBe('known');
    expect(sample.sourceEventTime).not.toBe(sample.observedAt);
  });

  it('unknown sourceEventTime stays null and is flagged, never observedAt', () => {
    const parsed = parseRss(readFixture('missing-pubdate-feed.xml'), {
      sourceId: 'src.rss.nopubdate',
      rawPayloadId: 'raw-nopub-1',
      observedAt: '2026-05-29T11:59:00.000Z',
      now: CLOCK.now(),
    });
    const normalized = normalizeParsedItems(parsed.parsedItems, {
      source: DEV_INGESTION_SOURCE_LIST.find((s) => s.sourceId === 'src.rss.nopubdate')!,
      observedAt: '2026-05-29T11:59:00.000Z',
      ingestedAt: '2026-05-29T11:59:00.000Z',
      normalizedAt: '2026-05-29T11:59:00.000Z',
    });
    for (const n of normalized) {
      expect(n.sourceEventTime).toBeNull();
      expect(n.sourceEventTimeStatus).toBe('unknown');
    }
  });
});

describe('selector integration: ingested → Phase 2.0 gates, quarantine intact', () => {
  it('batch ingestion respects the pre-fetch gate and only allowed sources produce items', async () => {
    const store = new AppendOnlyIngestionStore();
    const runs = await runIngestionBatch(DEV_INGESTION_SOURCE_LIST, {
      fetcher: recordedFetcher(),
      store,
      clock: CLOCK,
    });

    const skipped = runs.filter((r) => r.status === 'skipped').map((r) => r.sourceId);
    expect(skipped).toContain('src.rss.review');
    expect(skipped).toContain('src.rss.disabled');
    const producedSourceIds = new Set(store.normalizedItems.map((n) => n.sourceId));
    expect(producedSourceIds.has('src.rss.review')).toBe(false);
    expect(producedSourceIds.has('src.rss.disabled')).toBe(false);

    const snapshot = buildIngestedSnapshot({
      generatedAt: '2026-05-29T12:00:00.000Z',
      sources: DEV_INGESTION_SOURCE_LIST,
      normalizedItems: store.normalizedItems,
    });

    const ingestedIds = ingestedItems(snapshot).map((i) => i.sourceId);
    expect(ingestedIds.length).toBeGreaterThan(0);
    for (const sid of ingestedIds) {
      expect(['src.rss.review', 'src.rss.disabled']).not.toContain(sid);
    }

    for (const item of promotableItems(snapshot)) {
      const src = snapshot.sources.find((s) => s.sourceId === item.sourceId)!;
      expect(src.enabled).toBe(true);
      expect(src.legalStatus).toBe('allowed');
      expect(Boolean(item.url) || Boolean(item.sourceItemId)).toBe(true);
      expect(['verified', 'reported', 'scheduled']).toContain(item.verificationTier);
    }
  });
});
