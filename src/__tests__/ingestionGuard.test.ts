import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppendOnlyIngestionStore, fixedClock, ingestPayloadText } from '@/domain/ingestion';
import { DEV_INGESTION_SOURCE_LIST } from '@/fixtures/rss/ingestionSources';
import type { SourceProfile } from '@/domain/types';

const CLOCK = fixedClock('2026-05-30T12:00:00.000Z');

const readFixture = (name: string) =>
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/rss', name), 'utf8');

const sourceById = (id: string): SourceProfile =>
  DEV_INGESTION_SOURCE_LIST.find((s) => s.sourceId === id)!;

const callPublic = (source: SourceProfile) => {
  const store = new AppendOnlyIngestionStore();
  const run = ingestPayloadText({
    source,
    payloadText: readFixture('clean-market-feed.xml'),
    fetcherVersion: 'recorded-fixture-fetcher-v1',
    store,
    clock: CLOCK,
  });
  return { store, run };
};

describe('public ingestPayloadText is safe-by-contract (cannot bypass the gate)', () => {
  it('needs_review source: nothing stored, returns a skipped run', () => {
    const { store, run } = callPublic(sourceById('src.rss.review'));
    expect(run.status).toBe('skipped');
    expect(run.legalStatusAtRun).toBe('needs_review');
    expect(run.skipReason).toBe('legal_status_needs_review');

    expect(store.rawPayloads).toHaveLength(0);
    expect(store.normalizedItems).toHaveLength(0);
    expect(store.malformedItems).toHaveLength(0);
    expect(run.rawPayloadIds).toEqual([]);
    expect(run.normalizedItemIds).toEqual([]);
  });

  it('disabled source: nothing stored, returns a skipped run', () => {
    const { store, run } = callPublic(sourceById('src.rss.disabled'));
    expect(run.status).toBe('skipped');
    expect(run.legalStatusAtRun).toBe('disabled');
    expect(run.skipReason).toBe('legal_status_disabled');
    expect(store.rawPayloads).toHaveLength(0);
    expect(store.normalizedItems).toHaveLength(0);
    expect(store.malformedItems).toHaveLength(0);
  });

  it('allowed source: still processes normally', () => {
    const { store, run } = callPublic(sourceById('src.rss.clean'));
    expect(run.status).not.toBe('skipped');
    expect(store.rawPayloads).toHaveLength(1);
    expect(store.rawPayloads[0].status).toBe('fetched');
    expect(store.normalizedItems.length).toBeGreaterThanOrEqual(5);
  });
});
