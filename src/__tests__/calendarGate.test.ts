import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixedClock } from '@/domain/ingestion';
import type { FetchContext, FetchOutcome, SourceFetcher } from '@/domain/ingestion';
import {
  activeUpcomingViews,
  AppendOnlyCalendarStore,
  runCalendarIngestion,
  runRecordedCalendarIngestion,
  selectCalendarEligibleSources,
} from '@/domain/calendar';
import { DEV_CALENDAR_SOURCE_LIST, calendarSourceById } from '@/fixtures/calendar/calendarSources';
import type { SourceProfile } from '@/domain/types';

const CLOCK = fixedClock('2026-05-30T12:00:00.000Z');

const readFixture = (name: string) =>
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/calendar', name),
    'utf8',
  );

class SpyFetcher implements SourceFetcher {
  readonly fetcherVersion = 'spy-fetcher-v1';
  readonly calls: string[] = [];
  constructor(private readonly json: string) {}
  async fetch(source: SourceProfile, _ctx: FetchContext): Promise<FetchOutcome> {
    this.calls.push(source.sourceId);
    return { status: 'fetched', payloadText: this.json };
  }
}

describe('A. calendar legalStatus pre-read gate', () => {
  it('selectCalendarEligibleSources keeps only enabled + allowed + calendar-type', () => {
    const ids = selectCalendarEligibleSources(DEV_CALENDAR_SOURCE_LIST).map((s) => s.sourceId);
    expect(ids).toContain('src.cal.fixture');
    expect(ids).not.toContain('src.cal.review');
    expect(ids).not.toContain('src.cal.disabled');
  });

  it('allowed calendar source IS read by the fetcher', async () => {
    const fetcher = new SpyFetcher(readFixture('economic-calendar-clean.json'));
    const store = new AppendOnlyCalendarStore();
    const run = await runCalendarIngestion({
      source: calendarSourceById('src.cal.fixture'),
      fetcher,
      store,
      clock: CLOCK,
    });
    expect(fetcher.calls).toEqual(['src.cal.fixture']);
    expect(run.status).not.toBe('skipped');
  });

  it('needs_review calendar source is skipped BEFORE the fetcher is called', async () => {
    const fetcher = new SpyFetcher(readFixture('economic-calendar-clean.json'));
    const store = new AppendOnlyCalendarStore();
    const run = await runCalendarIngestion({
      source: calendarSourceById('src.cal.review'),
      fetcher,
      store,
      clock: CLOCK,
    });
    expect(fetcher.calls).toEqual([]);
    expect(run.status).toBe('skipped');
    expect(run.legalStatusAtRun).toBe('needs_review');
    expect(run.skipReason).toBe('legal_status_needs_review');
    expect(store.rawPayloads).toHaveLength(0);
    expect(store.revisions).toHaveLength(0);
  });

  it('disabled calendar source is skipped BEFORE the fetcher is called', async () => {
    const fetcher = new SpyFetcher(readFixture('economic-calendar-clean.json'));
    const store = new AppendOnlyCalendarStore();
    const run = await runCalendarIngestion({
      source: calendarSourceById('src.cal.disabled'),
      fetcher,
      store,
      clock: CLOCK,
    });
    expect(fetcher.calls).toEqual([]);
    expect(run.status).toBe('skipped');
    expect(run.legalStatusAtRun).toBe('disabled');
    expect(run.skipReason).toBe('legal_status_disabled');
    expect(store.revisions).toHaveLength(0);
  });
});

describe('A. runRecordedCalendarIngestion enforces the gate (safe by contract)', () => {
  const ingestRecorded = (sourceId: string) => {
    const store = new AppendOnlyCalendarStore();
    const run = runRecordedCalendarIngestion({
      source: calendarSourceById(sourceId),
      payloadText: readFixture('economic-calendar-clean.json'),
      fetcherVersion: 'recorded-fixture-fetcher-v1',
      store,
      clock: CLOCK,
    });
    return { store, run };
  };

  it('needs_review source: skipped, nothing stored, no active upcoming event', () => {
    const { store, run } = ingestRecorded('src.cal.review');
    expect(run.status).toBe('skipped');
    expect(run.legalStatusAtRun).toBe('needs_review');
    expect(run.skipReason).toBe('legal_status_needs_review');
    expect(run.rawPayloadIds).toEqual([]);
    expect(run.createdRevisionIds).toEqual([]);
    expect(store.rawPayloads).toHaveLength(0);
    expect(store.revisions).toHaveLength(0);
    expect(activeUpcomingViews(store, CLOCK.now())).toHaveLength(0);
  });

  it('disabled source: skipped, nothing stored, no active upcoming event', () => {
    const { store, run } = ingestRecorded('src.cal.disabled');
    expect(run.status).toBe('skipped');
    expect(run.legalStatusAtRun).toBe('disabled');
    expect(run.skipReason).toBe('legal_status_disabled');
    expect(run.rawPayloadIds).toEqual([]);
    expect(run.createdRevisionIds).toEqual([]);
    expect(store.rawPayloads).toHaveLength(0);
    expect(store.revisions).toHaveLength(0);
    expect(activeUpcomingViews(store, CLOCK.now())).toHaveLength(0);
  });

  it('allowed source: reads the recorded fixture, stores a raw payload, creates revisions', () => {
    const { store, run } = ingestRecorded('src.cal.fixture');
    expect(run.status).not.toBe('skipped');
    expect(run.skipReason).toBeUndefined();
    expect(store.rawPayloads).toHaveLength(1);
    expect(store.rawPayloads[0].status).toBe('fetched');
    expect(run.createdRevisionIds.length).toBeGreaterThanOrEqual(6);
    expect(store.revisions.length).toBeGreaterThanOrEqual(6);
    expect(activeUpcomingViews(store, CLOCK.now()).length).toBeGreaterThan(0);
  });
});
