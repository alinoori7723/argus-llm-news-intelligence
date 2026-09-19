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

const ingest = (store: AppendOnlyCalendarStore, name: string) =>
  runRecordedCalendarIngestion({
    source: SOURCE,
    payloadText: readFixture(name),
    fetcherVersion: 'recorded-fixture-fetcher-v1',
    store,
    clock: CLOCK,
  });

describe('I. append-only calendar store', () => {
  it('multiple ingestions preserve prior raw payloads (no overwrite)', () => {
    const store = new AppendOnlyCalendarStore();
    ingest(store, 'economic-calendar-changed-time-v1.json');
    const firstPayloadId = store.rawPayloads[0].rawPayloadId;
    const countAfterFirst = store.rawPayloads.length;
    ingest(store, 'economic-calendar-changed-time-v2.json');
    expect(store.rawPayloads.length).toBe(countAfterFirst + 1);
    expect(store.rawPayloads[0].rawPayloadId).toBe(firstPayloadId);
  });

  it('prior revision is preserved intact (not destructively overwritten)', () => {
    const store = new AppendOnlyCalendarStore();
    ingest(store, 'economic-calendar-changed-time-v1.json');
    const rev1Before = store.revisions.find((r) => r.sourceEventId === CPI)!;
    expect(rev1Before.scheduledFor).toBe('2026-06-03T12:30:00.000Z');

    ingest(store, 'economic-calendar-changed-time-v2.json');
    const rev1After = store.revisions.find(
      (r) => r.sourceEventId === CPI && r.revisionNumber === 1,
    )!;

    expect(rev1After.scheduledFor).toBe('2026-06-03T12:30:00.000Z');
    expect(rev1After.revisionStatus).toBe('superseded');
    expect(rev1After.supersededByRevisionId).toBeDefined();

    expect(store.revisionsForEvent(SOURCE.sourceId, CPI)).toHaveLength(2);
  });

  it('the active current view is derived from revisions', () => {
    const store = new AppendOnlyCalendarStore();
    ingest(store, 'economic-calendar-changed-time-v1.json');
    ingest(store, 'economic-calendar-changed-time-v2.json');
    const current = currentRevisions(store).filter((r) => r.sourceEventId === CPI);
    expect(current).toHaveLength(1);
    expect(current[0].revisionNumber).toBe(2);
    expect(current[0].scheduledFor).toBe('2026-06-03T14:00:00.000Z');
  });

  it('an unchanged re-ingestion records confirmations without new revisions', () => {
    const store = new AppendOnlyCalendarStore();
    ingest(store, 'economic-calendar-clean.json');
    const revisionsAfterFirst = store.revisions.length;
    const run2 = ingest(store, 'economic-calendar-clean.json');

    expect(store.revisions.length).toBe(revisionsAfterFirst);
    expect(run2.createdRevisionIds).toHaveLength(0);
    expect(run2.unchangedConfirmationIds.length).toBe(revisionsAfterFirst);
    expect(store.confirmations.length).toBe(revisionsAfterFirst);
  });
});
