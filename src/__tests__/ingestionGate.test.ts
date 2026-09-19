import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AppendOnlyIngestionStore,
  fixedClock,
  runIngestion,
  selectFetchEligibleSources,
  skipReasonFor,
  type FetchContext,
  type FetchOutcome,
  type SourceFetcher,
} from '@/domain/ingestion';
import { DEV_INGESTION_SOURCE_LIST } from '@/fixtures/rss/ingestionSources';
import type { SourceProfile } from '@/domain/types';

const FIXED = fixedClock('2026-05-29T12:00:00.000Z');

const readFixture = (name: string) =>
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/rss', name), 'utf8');

const sourceById = (id: string): SourceProfile =>
  DEV_INGESTION_SOURCE_LIST.find((s) => s.sourceId === id)!;

class SpyFetcher implements SourceFetcher {
  readonly fetcherVersion = 'spy-fetcher-v1';
  readonly calls: string[] = [];
  constructor(private readonly xml: string) {}
  async fetch(source: SourceProfile, _ctx: FetchContext): Promise<FetchOutcome> {
    this.calls.push(source.sourceId);
    return { status: 'fetched', payloadText: this.xml };
  }
}

describe('A. legalStatus pre-fetch gate', () => {
  it('selectFetchEligibleSources keeps only enabled + allowed + supported sources', () => {
    const eligible = selectFetchEligibleSources(DEV_INGESTION_SOURCE_LIST).map((s) => s.sourceId);
    expect(eligible).toContain('src.rss.clean');
    expect(eligible).not.toContain('src.rss.review');
    expect(eligible).not.toContain('src.rss.disabled');
  });

  it('an allowed source IS passed to the fetcher', async () => {
    const fetcher = new SpyFetcher(readFixture('clean-market-feed.xml'));
    const store = new AppendOnlyIngestionStore();
    const run = await runIngestion({
      source: sourceById('src.rss.clean'),
      fetcher,
      store,
      clock: FIXED,
    });
    expect(fetcher.calls).toEqual(['src.rss.clean']);
    expect(run.status).not.toBe('skipped');
  });

  it('a needs_review source is skipped BEFORE the fetcher is called', async () => {
    const fetcher = new SpyFetcher(readFixture('clean-market-feed.xml'));
    const store = new AppendOnlyIngestionStore();
    const run = await runIngestion({
      source: sourceById('src.rss.review'),
      fetcher,
      store,
      clock: FIXED,
    });
    expect(fetcher.calls).toEqual([]);
    expect(run.status).toBe('skipped');
    expect(run.legalStatusAtRun).toBe('needs_review');
    expect(run.skipReason).toBe('legal_status_needs_review');
    expect(run.rawPayloadIds).toEqual([]);
    expect(store.rawPayloads).toHaveLength(0);
  });

  it('a disabled source is skipped BEFORE the fetcher is called', async () => {
    const fetcher = new SpyFetcher(readFixture('clean-market-feed.xml'));
    const store = new AppendOnlyIngestionStore();
    const run = await runIngestion({
      source: sourceById('src.rss.disabled'),
      fetcher,
      store,
      clock: FIXED,
    });
    expect(fetcher.calls).toEqual([]);
    expect(run.status).toBe('skipped');
    expect(run.legalStatusAtRun).toBe('disabled');
    expect(run.skipReason).toBe('legal_status_disabled');
    expect(store.rawPayloads).toHaveLength(0);
  });

  it('skipReasonFor returns null only for fetch-eligible sources', () => {
    expect(skipReasonFor(sourceById('src.rss.clean'))).toBeNull();
    expect(skipReasonFor(sourceById('src.rss.review'))).toBe('legal_status_needs_review');
    expect(skipReasonFor(sourceById('src.rss.disabled'))).toBe('legal_status_disabled');
  });
});

describe('J. deterministic clock', () => {
  it('ingestion stamps run timestamps from the explicit clock, not the wall clock', async () => {
    const fetcher = new SpyFetcher(readFixture('clean-market-feed.xml'));
    const store = new AppendOnlyIngestionStore();
    const run = await runIngestion({
      source: sourceById('src.rss.clean'),
      fetcher,
      store,
      clock: fixedClock('2026-05-29T12:00:00.000Z'),
    });
    expect(run.startedAt).toBe('2026-05-29T12:00:00.000Z');
    expect(run.finishedAt).toBe('2026-05-29T12:00:00.000Z');
    const payload = store.rawPayloads[0];
    expect(payload.fetchedAt).toBe('2026-05-29T12:00:00.000Z');
    expect(payload.observedAt).toBe('2026-05-29T12:00:00.000Z');
  });

  it('two runs with the same fixed clock and inputs are deterministic', async () => {
    const run = async () => {
      const store = new AppendOnlyIngestionStore();
      const r = await runIngestion({
        source: sourceById('src.rss.clean'),
        fetcher: new SpyFetcher(readFixture('clean-market-feed.xml')),
        store,
        clock: fixedClock('2026-05-29T12:00:00.000Z'),
      });
      return { r, items: store.normalizedItems.map((n) => n.itemId) };
    };
    const a = await run();
    const b = await run();
    expect(a.items).toEqual(b.items);
    expect(a.r.normalizedItemIds).toEqual(b.r.normalizedItemIds);
  });
});
