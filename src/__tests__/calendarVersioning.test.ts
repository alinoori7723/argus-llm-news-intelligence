import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixedClock } from '@/domain/ingestion';
import {
  AppendOnlyCalendarStore,
  currentRevisions,
  runRecordedCalendarIngestion,
} from '@/domain/calendar';
import { calendarSourceById } from '@/fixtures/calendar/calendarSources';

const CLOCK = fixedClock('2026-05-30T12:00:00.000Z');
const SOURCE = calendarSourceById('src.cal.fixture');
const CPI = 'evt-us-cpi-2026-06';

const readFixture = (name: string) =>
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/calendar', name),
    'utf8',
  );

const ingest = (store: AppendOnlyCalendarStore, payloadText: string) =>
  runRecordedCalendarIngestion({
    source: SOURCE,
    payloadText,
    fetcherVersion: 'recorded-fixture-fetcher-v1',
    store,
    clock: CLOCK,
  });

const cpiRevisions = (store: AppendOnlyCalendarStore) =>
  store.revisions
    .filter((r) => r.sourceEventId === CPI)
    .sort((a, b) => a.revisionNumber - b.revisionNumber);

describe('D. versioning / supersession', () => {
  const store = new AppendOnlyCalendarStore();
  const run1 = ingest(store, readFixture('economic-calendar-changed-time-v1.json'));
  const run2 = ingest(store, readFixture('economic-calendar-changed-time-v2.json'));

  it('first seen creates revisionNumber 1 with changeReason first_seen', () => {
    expect(run1.createdRevisionIds).toHaveLength(1);
    const revs = cpiRevisions(store);
    expect(revs[0].revisionNumber).toBe(1);
    expect(revs[0].changeReason).toBe('first_seen');
  });

  it('changed scheduledFor creates revisionNumber 2 (time_changed) and supersedes rev 1', () => {
    const [rev1, rev2] = cpiRevisions(store);
    expect(rev2.revisionNumber).toBe(2);
    expect(rev2.changeReason).toBe('time_changed');
    expect(rev2.revisionStatus).toBe('active');

    expect(rev2.supersedesRevisionId).toBe(rev1.revisionId);
    expect(rev1.supersededByRevisionId).toBe(rev2.revisionId);
    expect(rev1.revisionStatus).toBe('superseded');

    expect(run2.supersededRevisionIds).toContain(rev1.revisionId);

    expect(rev2.previousScheduledFor).toBe(rev1.scheduledFor);
    expect(rev2.scheduledFor).not.toBe(rev1.scheduledFor);
  });

  it('history remains inspectable; current view is the latest active revision', () => {
    expect(cpiRevisions(store)).toHaveLength(2);
    const current = currentRevisions(store).filter((r) => r.sourceEventId === CPI);
    expect(current).toHaveLength(1);
    expect(current[0].revisionNumber).toBe(2);
  });
});

describe('E. cancellation / postponement', () => {
  it('cancelled event creates a cancelled revision, supersedes prior, and is not active upcoming', () => {
    const store = new AppendOnlyCalendarStore();
    ingest(store, readFixture('economic-calendar-changed-time-v1.json'));
    ingest(store, readFixture('economic-calendar-cancelled.json'));

    const [rev1, rev2] = cpiRevisions(store);
    expect(rev2.revisionStatus).toBe('cancelled');
    expect(rev2.changeReason).toBe('cancelled');
    expect(rev1.supersededByRevisionId).toBe(rev2.revisionId);

    const current = currentRevisions(store).find((r) => r.sourceEventId === CPI)!;
    expect(current.revisionStatus).toBe('cancelled');

    const activeUpcoming = currentRevisions(store).filter(
      (r) => r.revisionStatus === 'active' && r.scheduledFor !== null,
    );
    expect(activeUpcoming.find((r) => r.sourceEventId === CPI)).toBeUndefined();
  });

  it('postponed-without-new-time does not remain scheduled at the old time', () => {
    const store = new AppendOnlyCalendarStore();
    ingest(store, readFixture('economic-calendar-changed-time-v1.json'));
    const postponedPayload = JSON.stringify({
      events: [
        {
          sourceEventId: CPI,
          eventName: 'CPI m/m',
          country: 'US',
          currency: 'USD',
          importance: 'high',
          status: 'postponed',
          sourceUrl: 'https://example.invalid/fixture/calendar/us-cpi',
        },
      ],
    });
    ingest(store, postponedPayload);

    const current = currentRevisions(store).find((r) => r.sourceEventId === CPI)!;
    expect(current.revisionStatus).toBe('postponed');
    expect(current.changeReason).toBe('postponed');

    expect(current.scheduledFor).toBeNull();
    const rev1 = cpiRevisions(store)[0];
    expect(current.scheduledFor).not.toBe(rev1.scheduledFor);
  });
});

describe('F. actual added', () => {
  const store = new AppendOnlyCalendarStore();
  ingest(store, readFixture('economic-calendar-changed-time-v1.json'));
  ingest(store, readFixture('economic-calendar-actual-added.json'));

  it('actual value creates a completed revision (actual_added) and preserves the prior scheduled revision', () => {
    const [rev1, rev2] = cpiRevisions(store);
    expect(rev2.revisionStatus).toBe('completed');
    expect(rev2.changeReason).toBe('actual_added');
    expect(rev2.values.actual).toBe('0.4%');

    expect(rev1.revisionNumber).toBe(1);
    expect(rev1.scheduledFor).toBe('2026-06-03T12:30:00.000Z');
    expect(rev1.values.actual).toBeUndefined();
  });

  it('a completed event is not an active upcoming item', () => {
    const current = currentRevisions(store).find((r) => r.sourceEventId === CPI)!;
    expect(current.revisionStatus).toBe('completed');
  });
});
