import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixedClock } from '@/domain/ingestion';
import {
  CALENDAR_PARSER_VERSION,
  parseCalendar,
  type ParseCalendarOptions,
} from '@/domain/calendar';

const NOW = fixedClock('2026-05-30T12:00:00.000Z').now();
const OBSERVED_AT = '2026-05-30T11:00:00.000Z';

const readFixture = (name: string) =>
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/calendar', name),
    'utf8',
  );

const optsFor = (sourceId: string): ParseCalendarOptions => ({
  sourceId,
  rawPayloadId: `cal-raw-${sourceId}-1`,
  observedAt: OBSERVED_AT,
  now: NOW,
});

describe('B. clean calendar parsing', () => {
  const result = parseCalendar(
    readFixture('economic-calendar-clean.json'),
    optsFor('src.cal.fixture'),
  );

  it('parses at least 6 events with no malformed records', () => {
    expect(result.ok).toBe(true);
    expect(result.parsedEvents.length).toBeGreaterThanOrEqual(6);
    expect(result.malformedRecords).toHaveLength(0);
  });

  it('every parsed event has identity, scheduledFor, parserVersion, and evidence', () => {
    for (const e of result.parsedEvents) {
      expect(e.sourceEventId.length).toBeGreaterThan(0);
      expect(e.scheduledFor).not.toBeNull();
      expect(e.parserVersion).toBe(CALENDAR_PARSER_VERSION);
      expect(Boolean(e.sourceUrl) || Boolean(e.sourceEventId)).toBe(true);
    }
  });
});

describe('C. scheduledFor semantics', () => {
  it('scheduledFor is separate from observedAt and never equals it', () => {
    const result = parseCalendar(
      readFixture('economic-calendar-clean.json'),
      optsFor('src.cal.fixture'),
    );
    for (const e of result.parsedEvents) {
      expect(e.scheduledFor).not.toBe(OBSERVED_AT);
    }
  });

  it('a scheduled event with missing scheduledFor is quarantined, never given observedAt', () => {
    const result = parseCalendar(
      readFixture('economic-calendar-malformed.json'),
      optsFor('src.cal.malformed'),
    );

    expect(result.parsedEvents.find((e) => e.sourceEventId === 'evt-mal-no-time')).toBeUndefined();
    expect(result.malformedRecords.some((m) => m.reason === 'missing_scheduled_for')).toBe(true);

    for (const e of result.parsedEvents) {
      expect(e.scheduledFor).not.toBe(OBSERVED_AT);
    }
  });
});

describe('H. malformed quarantine', () => {
  const result = parseCalendar(
    readFixture('economic-calendar-malformed.json'),
    optsFor('src.cal.malformed'),
  );

  it('missing identity is quarantined', () => {
    expect(result.malformedRecords.some((m) => m.reason === 'missing_identity')).toBe(true);
  });

  it('invalid timestamp is quarantined', () => {
    expect(result.malformedRecords.some((m) => m.reason === 'invalid_scheduled_for')).toBe(true);
  });

  it('malformed importance is downgraded to unknown with a warning (not quarantined)', () => {
    const downgraded = result.parsedEvents.find(
      (e) => e.sourceEventId === 'evt-mal-bad-importance',
    );
    expect(downgraded).toBeDefined();
    expect(downgraded!.importanceTier).toBe('unknown');
    expect(result.warnings.some((w) => w.code === 'importance_downgraded')).toBe(true);
  });

  it('malformed records carry parserVersion + observedAt + quarantinedAt', () => {
    expect(result.malformedRecords.length).toBeGreaterThan(0);
    for (const m of result.malformedRecords) {
      expect(m.parserVersion).toBe(CALENDAR_PARSER_VERSION);
      expect(m.observedAt).toBe(OBSERVED_AT);
      expect(m.quarantinedAt).toBe('2026-05-30T12:00:00.000Z');
    }
  });

  it('overall parse is partial (some usable events remain) and does not throw', () => {
    expect(result.ok).toBe(true);
    expect(result.parsedEvents.length).toBeGreaterThan(0);
  });
});
