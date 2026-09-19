import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixedClock } from '@/domain/ingestion';
import {
  AppendOnlyCalendarStore,
  confirmationStateFor,
  currentRevisions,
  runRecordedCalendarIngestion,
  toCalendarEventView,
} from '@/domain/calendar';
import { calendarSourceById } from '@/fixtures/calendar/calendarSources';

const CPI = 'evt-us-cpi-2026-06';
const readFixture = (name: string) =>
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/calendar', name),
    'utf8',
  );

const buildStore = () => {
  const store = new AppendOnlyCalendarStore();
  runRecordedCalendarIngestion({
    source: calendarSourceById('src.cal.fixture'),
    payloadText: readFixture('economic-calendar-clean.json'),
    fetcherVersion: 'recorded-fixture-fetcher-v1',
    store,
    clock: fixedClock('2026-05-30T11:00:00.000Z'),
  });
  return store;
};

const cpiView = (store: AppendOnlyCalendarStore, nowIso: string) => {
  const cpi = currentRevisions(store).find((r) => r.sourceEventId === CPI)!;
  return toCalendarEventView(store, cpi, fixedClock(nowIso).now());
};

describe('G. stale confirmation policy', () => {
  it('high-importance confirmationStateFor: fresh ≤30m, aging ≤60m, stale beyond', () => {
    const now = fixedClock('2026-05-30T12:00:00.000Z').now();
    expect(confirmationStateFor('high', '2026-05-30T11:45:00.000Z', now)).toBe('fresh');
    expect(confirmationStateFor('high', '2026-05-30T11:15:00.000Z', now)).toBe('aging');
    expect(confirmationStateFor('high', '2026-05-30T10:00:00.000Z', now)).toBe('stale');
    expect(confirmationStateFor('high', null, now)).toBe('unknown');
  });

  it('fresh confirmation + upcoming event ⇒ promotable', () => {
    const view = cpiView(buildStore(), '2026-05-30T11:20:00.000Z');
    expect(view.confirmationState).toBe('fresh');
    expect(view.promotion.eligible).toBe(true);
  });

  it('stale confirmation ⇒ NOT high-attention, but the event stays visible with a caveat', () => {
    const store = buildStore();
    const view = cpiView(store, '2026-05-30T12:30:00.000Z');
    expect(view.confirmationState).toBe('stale');
    expect(view.promotion.eligible).toBe(false);
    expect(view.promotion.reason).toMatch(/stale/);

    expect(currentRevisions(store).some((r) => r.sourceEventId === CPI)).toBe(true);

    expect(view.current.lastConfirmedAt).toBe('2026-05-30T11:00:00.000Z');
    expect(view.effectiveLastConfirmedAt).toBe('2026-05-30T11:00:00.000Z');
  });
});
