import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixedClock } from '@/domain/ingestion';
import Calendar from '@/pages/Calendar';
import {
  CALENDAR_RICH_EVENT_VIEWS,
  calendarRichBootstrapStore,
} from '@/fixtures/calendar/calendarBootstrap';
import {
  CALENDAR_CONFIRMATIONS_STREAM,
  CALENDAR_MALFORMED_RECORDS_STREAM,
  CALENDAR_RAW_PAYLOADS_STREAM,
  CALENDAR_REVISIONS_STREAM,
  CALENDAR_RUNS_STREAM,
  CALENDAR_SNAPSHOTS_STREAM,
  CALENDAR_STREAM_ORDER,
  CALENDAR_SUPERSESSION_EVENTS_STREAM,
  PersistenceBackedCalendarStore,
  applySupersessionEvents,
  buildCalendarSnapshot,
  calendarEventViews,
  currentCalendarRevisions,
  currentRevisions,
  deriveCalendarRevisions,
  mapSupersessionToInput,
  orderCalendarRecordsGlobally,
  replayCalendarHistory,
  runRecordedCalendarIngestion,
  toCalendarEventView,
  validateSupersessionReferences,
  type CalendarEventRevision,
  type CalendarStore,
  type CalendarSupersessionEvent,
} from '@/domain/calendar';
import { InMemoryAppendOnlyPersistenceStore, type PersistedRecord } from '@/domain/persistence';
import { calendarSourceById } from '@/fixtures/calendar/calendarSources';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLOCK = fixedClock('2026-05-30T12:00:00.000Z');
const SOURCE = calendarSourceById('src.cal.fixture');
const CPI = 'evt-us-cpi-2026-06';

const readFixture = (name: string): string =>
  readFileSync(resolve(repoRoot, 'src/fixtures/calendar', name), 'utf8');

const newStore = (): {
  backing: InMemoryAppendOnlyPersistenceStore;
  store: CalendarStore;
} => {
  const backing = new InMemoryAppendOnlyPersistenceStore();
  return { backing, store: new PersistenceBackedCalendarStore(backing) };
};

const ingest = (store: CalendarStore, fixtureName: string, clock = CLOCK): void => {
  runRecordedCalendarIngestion({
    source: SOURCE,
    payloadText: readFixture(fixtureName),
    fetcherVersion: 'recorded-fixture-fetcher-v1',
    store,
    clock,
  });
};

const changedTimeStore = () => {
  const { backing, store } = newStore();
  ingest(store, 'economic-calendar-changed-time-v1.json');
  ingest(store, 'economic-calendar-changed-time-v2.json');
  return { backing, store };
};

const rawRevisions = (backing: InMemoryAppendOnlyPersistenceStore): CalendarEventRevision[] =>
  backing.readStream(CALENDAR_REVISIONS_STREAM).map((r) => r.payload as CalendarEventRevision);

describe('A. persistence-backed calendar store maps to seven separate streams', () => {
  it('the seven required stream names exist in the documented cross-stream order', () => {
    expect(CALENDAR_STREAM_ORDER).toEqual([
      'calendar-raw-payloads',
      'calendar-snapshots',
      'calendar-revisions',
      'calendar-confirmations',
      'calendar-malformed-records',
      'calendar-runs',
      'calendar-supersession-events',
    ]);
  });

  it('changed-time ingestion routes records to raw/snapshot/revision/run/supersession streams', () => {
    const { backing } = changedTimeStore();
    expect(backing.readStream(CALENDAR_RAW_PAYLOADS_STREAM).length).toBe(2);
    expect(backing.readStream(CALENDAR_SNAPSHOTS_STREAM).length).toBe(2);
    expect(backing.readStream(CALENDAR_REVISIONS_STREAM).length).toBeGreaterThanOrEqual(2);
    expect(backing.readStream(CALENDAR_RUNS_STREAM).length).toBe(2);

    expect(backing.readStream(CALENDAR_SUPERSESSION_EVENTS_STREAM).length).toBe(1);
  });

  it('confirmations live only in the confirmations stream; malformed only in the malformed stream', () => {
    const conf = newStore();
    ingest(conf.store, 'economic-calendar-clean.json');
    ingest(conf.store, 'economic-calendar-clean.json');
    expect(conf.backing.readStream(CALENDAR_CONFIRMATIONS_STREAM).length).toBeGreaterThan(0);
    expect(conf.backing.readStream(CALENDAR_SUPERSESSION_EVENTS_STREAM).length).toBe(0);

    const mal = newStore();
    ingest(mal.store, 'economic-calendar-malformed.json');
    expect(mal.backing.readStream(CALENDAR_MALFORMED_RECORDS_STREAM).length).toBeGreaterThan(0);
  });
});

describe('B. supersession is append-only + replay-derived (controlled mutation removed)', () => {
  it('changed-time creates revision 1 + revision 2 + ONE supersession event', () => {
    const { backing } = changedTimeStore();
    const cpi = rawRevisions(backing)
      .filter((r) => r.sourceEventId === CPI)
      .sort((a, b) => a.revisionNumber - b.revisionNumber);
    expect(cpi.map((r) => r.revisionNumber)).toEqual([1, 2]);
    const events = backing
      .readStream(CALENDAR_SUPERSESSION_EVENTS_STREAM)
      .map((r) => r.payload as CalendarSupersessionEvent);
    const cpiEvent = events.find((e) => e.sourceEventId === CPI)!;
    expect(cpiEvent.reason).toBe('changed_time');
    expect(cpiEvent.supersededRevisionId).toBe(cpi[0].revisionId);
    expect(cpiEvent.supersedingRevisionId).toBe(cpi[1].revisionId);
  });

  it('the stored revision-1 record is NEVER mutated (still active, no back-link)', () => {
    const { backing } = changedTimeStore();
    const rev1Raw = rawRevisions(backing).find(
      (r) => r.sourceEventId === CPI && r.revisionNumber === 1,
    )!;

    expect(rev1Raw.revisionStatus).toBe('active');
    expect(rev1Raw.supersededByRevisionId).toBeUndefined();
    expect(rev1Raw.scheduledFor).toBe('2026-06-03T12:30:00.000Z');
  });

  it('the current view points to revision 2 BY REPLAY (derived), not by mutating revision 1', () => {
    const { store } = changedTimeStore();

    const derivedRev1 = store.revisions.find(
      (r) => r.sourceEventId === CPI && r.revisionNumber === 1,
    )!;
    expect(derivedRev1.revisionStatus).toBe('superseded');
    expect(derivedRev1.supersededByRevisionId).toBeDefined();
    const current = currentRevisions(store).filter((r) => r.sourceEventId === CPI);
    expect(current).toHaveLength(1);
    expect(current[0].revisionNumber).toBe(2);
    expect(current[0].scheduledFor).toBe('2026-06-03T14:00:00.000Z');
  });

  it('the persistence-backed store source contains NO markSuperseded / mutation API', () => {
    const strip = (code: string) =>
      code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const code = strip(
      readFileSync(
        resolve(repoRoot, 'src/domain/calendar/persistenceBackedCalendarStore.ts'),
        'utf8',
      ),
    );
    expect(code).not.toMatch(/markSuperseded/);
    const runner = strip(
      readFileSync(resolve(repoRoot, 'src/domain/calendar/runCalendarIngestion.ts'), 'utf8'),
    );
    expect(runner).not.toMatch(/markSuperseded/);
    expect(runner).toMatch(/appendSupersession/);
  });

  it('applySupersessionEvents REJECTS contradictory events deterministically', () => {
    const revisions = rawRevisions(changedTimeStore().backing);
    const r1 = revisions.find((r) => r.revisionNumber === 1)!;
    const e = (supersedingRevisionId: string): CalendarSupersessionEvent => ({
      supersessionEventId: `x-${supersedingRevisionId}`,
      calendarEventId: r1.calendarEventId,
      canonicalEventKey: r1.canonicalEventKey,
      sourceId: r1.sourceId,
      sourceEventId: r1.sourceEventId,
      supersededRevisionId: r1.revisionId,
      supersedingRevisionId,
      reason: 'changed_time',
      observedAt: r1.observedAt,
      ruleVersion: 'calendar-supersession-v1',
    });
    expect(() => applySupersessionEvents(revisions, [e('A'), e('B')])).toThrow(/contradictory/);
  });

  it('replay REJECTS a supersession event with an unresolved revision reference', () => {
    const { backing } = changedTimeStore();
    const records = [...backing.readAll()];
    const supEnv = records.find((r) => r.streamName === CALENDAR_SUPERSESSION_EVENTS_STREAM)!;
    const brokenPayload = {
      ...(supEnv.payload as CalendarSupersessionEvent),
      supersedingRevisionId: 'does-not-exist',
    };
    const broken: PersistedRecord = { ...supEnv, payload: brokenPayload };
    const others = records.filter((r) => r !== supEnv);
    expect(() => replayCalendarHistory([...others, broken])).toThrow(
      /unresolved supersession reference/,
    );
  });
});

describe('C. recordedAt is a pass-through of the correct domain field per stream', () => {
  it('raw=observedAt, snapshot=observedAt, revision=observedAt, run=finishedAt', () => {
    const { backing } = changedTimeStore();
    const raw = backing.readStream(CALENDAR_RAW_PAYLOADS_STREAM)[0];
    expect(raw.recordedAt).toBe((raw.payload as { observedAt: string }).observedAt);
    const snap = backing.readStream(CALENDAR_SNAPSHOTS_STREAM)[0];
    expect(snap.recordedAt).toBe((snap.payload as { observedAt: string }).observedAt);
    const rev = backing.readStream(CALENDAR_REVISIONS_STREAM)[0];
    expect(rev.recordedAt).toBe((rev.payload as CalendarEventRevision).observedAt);
    const run = backing.readStream(CALENDAR_RUNS_STREAM)[0];
    expect(run.recordedAt).toBe((run.payload as { finishedAt: string }).finishedAt);
  });

  it('confirmation envelope.recordedAt === confirmation.confirmedAt', () => {
    const { backing, store } = newStore();
    ingest(store, 'economic-calendar-clean.json');
    ingest(store, 'economic-calendar-clean.json');
    const conf = backing.readStream(CALENDAR_CONFIRMATIONS_STREAM)[0];
    expect(conf.recordedAt).toBe((conf.payload as { confirmedAt: string }).confirmedAt);
  });

  it('malformed envelope.recordedAt === malformed.quarantinedAt', () => {
    const { backing, store } = newStore();
    ingest(store, 'economic-calendar-malformed.json');
    const mal = backing.readStream(CALENDAR_MALFORMED_RECORDS_STREAM)[0];
    expect(mal.recordedAt).toBe((mal.payload as { quarantinedAt: string }).quarantinedAt);
  });

  it('supersession envelope.recordedAt === event.observedAt (the change instant)', () => {
    const { backing } = changedTimeStore();
    const sup = backing.readStream(CALENDAR_SUPERSESSION_EVENTS_STREAM)[0];
    expect(sup.recordedAt).toBe((sup.payload as CalendarSupersessionEvent).observedAt);
  });

  it('scheduledFor is NEVER used as recordedAt and is preserved unchanged on the revision', () => {
    const { backing } = changedTimeStore();
    for (const env of backing.readStream(CALENDAR_REVISIONS_STREAM)) {
      const p = env.payload as CalendarEventRevision;
      if (p.scheduledFor) expect(env.recordedAt).not.toBe(p.scheduledFor);
    }

    const cpi = rawRevisions(backing)
      .filter((r) => r.sourceEventId === CPI)
      .sort((a, b) => a.revisionNumber - b.revisionNumber);
    expect(cpi[0].scheduledFor).toBe('2026-06-03T12:30:00.000Z');
    expect(cpi[1].scheduledFor).toBe('2026-06-03T14:00:00.000Z');
  });

  it('postponed-without-new-time keeps scheduledFor null — never backfilled from observedAt', () => {
    const { store } = newStore();
    ingest(store, 'economic-calendar-changed-time-v1.json');
    const postponed = JSON.stringify({
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
    runRecordedCalendarIngestion({
      source: SOURCE,
      payloadText: postponed,
      fetcherVersion: 'recorded-fixture-fetcher-v1',
      store,
      clock: CLOCK,
    });
    const current = currentRevisions(store).find((r) => r.sourceEventId === CPI)!;
    expect(current.revisionStatus).toBe('postponed');
    expect(current.scheduledFor).toBeNull();
    expect(current.observedAt).not.toBeNull();
  });

  it('the mapping never samples a clock of its own (no Date.now / argless new Date / Clock)', () => {
    const raw = readFileSync(
      resolve(repoRoot, 'src/domain/calendar/calendarPersistenceMapping.ts'),
      'utf8',
    );
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(code).not.toMatch(/Date\.now\s*\(/);
    expect(code).not.toMatch(/new\s+Date\s*\(\s*\)/);
    expect(code).not.toMatch(/\bMath\.random\b/);
    expect(code).not.toMatch(/randomUUID|\buuid\b/);
    expect(code).not.toMatch(/\bClock\b/);
  });
});

describe('D. deterministic recordId includes the per-stream sequence', () => {
  it('two revisions at the SAME observedAt persist with distinct recordIds', () => {
    const { backing } = changedTimeStore();
    const cpiEnvs = backing
      .readStream(CALENDAR_REVISIONS_STREAM)
      .filter((r) => (r.payload as CalendarEventRevision).sourceEventId === CPI);
    expect(cpiEnvs).toHaveLength(2);

    expect(cpiEnvs[0].recordedAt).toBe(cpiEnvs[1].recordedAt);
    expect(cpiEnvs[0].recordId).not.toBe(cpiEnvs[1].recordId);
  });

  it('multiple confirmations at the same confirmedAt persist distinctly, in input order', () => {
    const { backing, store } = newStore();
    ingest(store, 'economic-calendar-clean.json');
    ingest(store, 'economic-calendar-clean.json');
    const confs = backing.readStream(CALENDAR_CONFIRMATIONS_STREAM);
    expect(confs.length).toBeGreaterThan(1);
    expect(new Set(confs.map((r) => r.recordId)).size).toBe(confs.length);
    expect(confs.map((r) => r.sequence)).toEqual([...Array(confs.length).keys()]);
    expect(confs.every((r) => r.recordedAt === confs[0].recordedAt)).toBe(true);
  });

  it('multiple supersession events at the same observedAt persist with distinct recordIds', () => {
    const { backing, store } = newStore();
    const ev = (n: number): CalendarSupersessionEvent => ({
      supersessionEventId: `sup-${n}`,
      calendarEventId: `src.cal.fixture::evt-${n}`,
      canonicalEventKey: `key-${n}`,
      sourceId: 'src.cal.fixture',
      sourceEventId: `evt-${n}`,
      supersededRevisionId: `rev-old-${n}`,
      supersedingRevisionId: `rev-new-${n}`,
      reason: 'changed_time',
      observedAt: '2026-05-30T12:00:00.000Z',
      ruleVersion: 'calendar-supersession-v1',
    });
    store.appendSupersession(ev(1));
    store.appendSupersession(ev(2));
    const recs = backing.readStream(CALENDAR_SUPERSESSION_EVENTS_STREAM);
    expect(recs).toHaveLength(2);
    expect(recs[0].recordedAt).toBe(recs[1].recordedAt);
    expect(recs[0].recordId).not.toBe(recs[1].recordId);
    expect(recs.map((r) => r.sequence)).toEqual([0, 1]);
  });

  it('malformed batch assigns sequence in input array order', () => {
    const { backing, store } = newStore();
    ingest(store, 'economic-calendar-malformed.json');
    const mal = backing.readStream(CALENDAR_MALFORMED_RECORDS_STREAM);
    expect(mal.map((r) => r.sequence)).toEqual([...Array(mal.length).keys()]);
  });

  it('a TRUE duplicate persisted recordId is still rejected by the underlying store', () => {
    const backing = new InMemoryAppendOnlyPersistenceStore();
    const input = mapSupersessionToInput(
      {
        supersessionEventId: 'sup-x',
        calendarEventId: 'c::e',
        canonicalEventKey: 'k',
        sourceId: 's',
        sourceEventId: 'e',
        supersededRevisionId: 'r1',
        supersedingRevisionId: 'r2',
        reason: 'changed_time',
        observedAt: '2026-05-30T12:00:00.000Z',
        ruleVersion: 'calendar-supersession-v1',
      },
      0,
    );
    backing.append(input);
    expect(() => backing.append(input)).toThrow(/duplicate recordId/);
  });
});

describe('E. active upcoming lifecycle (replay-derived current view)', () => {
  const currentCpi = (store: CalendarStore) =>
    currentRevisions(store).find((r) => r.sourceEventId === CPI)!;

  it('cancelled events are not active upcoming', () => {
    const { store } = newStore();
    ingest(store, 'economic-calendar-changed-time-v1.json');
    ingest(store, 'economic-calendar-cancelled.json');
    expect(currentCpi(store).revisionStatus).toBe('cancelled');
    const upcoming = currentRevisions(store).filter(
      (r) => r.revisionStatus === 'active' && r.scheduledFor !== null,
    );
    expect(upcoming.find((r) => r.sourceEventId === CPI)).toBeUndefined();
  });

  it('completed (actual-added) events are not active upcoming; prior revision preserved', () => {
    const { backing, store } = newStore();
    ingest(store, 'economic-calendar-changed-time-v1.json');
    ingest(store, 'economic-calendar-actual-added.json');
    expect(currentCpi(store).revisionStatus).toBe('completed');
    expect(currentCpi(store).values.actual).toBe('0.4%');

    const rev1 = rawRevisions(backing).find(
      (r) => r.sourceEventId === CPI && r.revisionNumber === 1,
    )!;
    expect(rev1.scheduledFor).toBe('2026-06-03T12:30:00.000Z');
    expect(rev1.values.actual).toBeUndefined();
  });

  it('historical revisions remain visible in the detail history view', () => {
    const { store } = changedTimeStore();
    const view = calendarEventViews(store, CLOCK.now()).find(
      (v) => v.current.sourceEventId === CPI,
    )!;
    expect(view.history.map((r) => r.revisionNumber)).toEqual([1, 2]);
    expect(view.current.revisionNumber).toBe(2);
  });
});

describe('F. confirmation + stale behavior (replay-derived, no mutation)', () => {
  const buildCleanAt = (instant: string) => {
    const { store } = newStore();
    ingest(store, 'economic-calendar-clean.json', fixedClock(instant));
    return store;
  };

  it('lastConfirmedAt is derived by replay from confirmation records (fresh updates current view)', () => {
    const { store } = newStore();
    ingest(store, 'economic-calendar-clean.json', fixedClock('2026-05-30T11:00:00.000Z'));

    ingest(store, 'economic-calendar-clean.json', fixedClock('2026-05-30T11:50:00.000Z'));
    const cpi = currentRevisions(store).find((r) => r.sourceEventId === CPI)!;
    const view = toCalendarEventView(store, cpi, fixedClock('2026-05-30T12:00:00.000Z').now());

    expect(view.effectiveLastConfirmedAt).toBe('2026-05-30T11:50:00.000Z');
    expect(cpi.lastConfirmedAt).toBe('2026-05-30T11:00:00.000Z');
    expect(view.confirmationState).toBe('fresh');
  });

  it('stale events stay visible but are not promotable (replay-derived, no mutated revision)', () => {
    const store = buildCleanAt('2026-05-30T11:00:00.000Z');
    const cpi = currentRevisions(store).find((r) => r.sourceEventId === CPI)!;
    const view = toCalendarEventView(store, cpi, fixedClock('2026-05-30T12:30:00.000Z').now());
    expect(view.confirmationState).toBe('stale');
    expect(view.promotion.eligible).toBe(false);

    expect(currentRevisions(store).some((r) => r.sourceEventId === CPI)).toBe(true);
  });
});

describe('G. replay from persisted records reproduces calendar state', () => {
  it('replay-derived current revisions equal the direct store current revisions', () => {
    const { backing, store } = changedTimeStore();
    const snap = replayCalendarHistory(backing.readAll());
    expect(currentCalendarRevisions(snap)).toEqual(currentRevisions(store));
    expect(deriveCalendarRevisions(snap)).toEqual(store.revisions);
  });

  it('replay is deterministic and order-insensitive (shuffled input → same derived view)', () => {
    const { backing } = changedTimeStore();
    const records = backing.readAll();
    const shuffled = [...records].reverse();
    expect(deriveCalendarRevisions(replayCalendarHistory(shuffled))).toEqual(
      deriveCalendarRevisions(replayCalendarHistory(records)),
    );
  });

  it('global ordering is stable regardless of input order', () => {
    const { backing } = changedTimeStore();
    const records = backing.readAll();
    const a = orderCalendarRecordsGlobally(records).map((r) => r.recordId);
    const b = orderCalendarRecordsGlobally([...records].reverse()).map((r) => r.recordId);
    expect(b).toEqual(a);
  });

  it('replay does NOT mutate the input records and returns frozen data', () => {
    const { backing } = changedTimeStore();
    const records = backing.readAll();
    const before = JSON.stringify(records);
    const snap = replayCalendarHistory(records);
    expect(JSON.stringify(records)).toBe(before);
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.revisions)).toBe(true);
    expect(snap.revisions.every((r) => Object.isFrozen(r))).toBe(true);
  });

  it('records from a foreign stream do NOT leak into calendar state', () => {
    const { backing } = changedTimeStore();
    const beforeRevs = buildCalendarSnapshot(backing.readAll()).revisions.length;
    backing.append({
      recordId: 'foreign-0',
      streamName: 'whisper-decisions',
      schemaVersion: 'x',
      producerVersion: 'x',
      sourcePhase: 'phase-2-16-test',
      payload: { decisionId: 'd' },
      recordedAt: '2026-05-30T12:00:00.000Z',
    });
    const snap = buildCalendarSnapshot(backing.readAll());
    expect(snap.revisions.length).toBe(beforeRevs);
  });

  it('replay REJECTS an unknown stream with a deterministic reason', () => {
    const foreign: PersistedRecord = {
      recordId: 'foreign-0',
      streamName: 'whisper-decisions',
      sequence: 0,
      recordedAt: '2026-05-30T12:00:00.000Z',
      schemaVersion: 'x',
      producerVersion: 'x',
      payloadHash: '0',
      sourcePhase: 'p',
      payload: {},
      contractVersion: 'persistence-contract-v1',
    };
    expect(() => replayCalendarHistory([foreign])).toThrow(/unknown stream/);
  });

  it('replay rejects duplicate recordId and non-contiguous per-stream sequence', () => {
    const { backing } = changedTimeStore();
    const records = backing.readAll();
    const rev = records.find((r) => r.streamName === CALENDAR_REVISIONS_STREAM)!;
    expect(() => replayCalendarHistory([rev, rev])).toThrow(/duplicate recordId/);
    const broken: PersistedRecord = { ...rev, recordId: 'rev-seq-9-only', sequence: 9 };
    expect(() => buildCalendarSnapshot([broken])).toThrow(/non-contiguous sequence/);
  });

  it('validateSupersessionReferences surfaces an unresolved reference explicitly', () => {
    const { backing } = changedTimeStore();
    const snap = buildCalendarSnapshot(backing.readAll());
    const check = validateSupersessionReferences(snap.revisions, [
      ...snap.supersessionEvents,
      {
        ...snap.supersessionEvents[0],
        supersessionEventId: 'orphan',
        supersedingRevisionId: 'nope',
      },
    ]);
    expect(check.ok).toBe(false);
    expect(check.unresolvedEventIds).toContain('orphan');
  });
});

describe('H. immutability of derived reads + historical revisions', () => {
  it('mutating a returned revision array/object does not affect later reads', () => {
    const { store } = changedTimeStore();
    const revs = store.revisions;
    try {
      (revs as CalendarEventRevision[]).push({ ...revs[0], revisionId: 'evil' });
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
    }
    expect(store.revisions.some((r) => r.revisionId === 'evil')).toBe(false);
  });

  it('derived revisions are frozen (historical revisions immutable)', () => {
    const { store } = changedTimeStore();
    expect(store.revisions.every((r) => Object.isFrozen(r))).toBe(true);
  });
});

describe('I. runtime wiring: persistence-backed present, legacy store absent in active runtime', () => {
  const scanDir = (rel: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(join(repoRoot, rel), { withFileTypes: true })) {
      const relPath = join(rel, entry.name);
      if (entry.isDirectory()) {
        if (relPath === join('src', '__tests__')) continue;
        out.push(...scanDir(relPath));
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
        out.push(relPath);
      }
    }
    return out;
  };
  const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8');
  const stripComments = (code: string): string =>
    code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const readCode = (rel: string) => stripComments(read(rel));
  const activeSrc = scanDir('src');
  const LEGACY_DEF = join('src', 'domain', 'calendar', 'store.ts');
  const PAGES = ['src/pages/Calendar.tsx', 'src/pages/Dashboard.tsx', 'src/pages/MorningBrief.tsx'];

  it('PRESENCE: the calendar fixtures wire the persistence-backed store', () => {
    const code = read('src/fixtures/calendar/demoCalendar.ts');
    expect(code).toMatch(/new PersistenceBackedCalendarStore\(/);
    expect(code).toMatch(/InMemoryAppendOnlyPersistenceStore/);
    expect(code).not.toMatch(/new AppendOnlyCalendarStore\(/);
  });

  it('ABSENCE: pages construct NO store and run NO ingestion on render; they read prepared views', () => {
    for (const p of PAGES) {
      const code = read(p);
      expect(code).not.toMatch(/new AppendOnlyCalendarStore\(/);
      expect(code).not.toMatch(/new PersistenceBackedCalendarStore\(/);
      expect(code).not.toMatch(/\brunCalendarIngestion\b|\brunRecordedCalendarIngestion\b/);
      expect(code).not.toMatch(/buildRichCalendarStore|buildCleanCalendarStore/);
    }

    expect(read('src/pages/Calendar.tsx')).toMatch(/CALENDAR_RICH_EVENT_VIEWS/);
  });

  it('AppendOnlyCalendarStore is referenced in CODE ONLY by its own definition in active non-test src', () => {
    const offenders = activeSrc.filter(
      (f) => f !== LEGACY_DEF && /\bAppendOnlyCalendarStore\b/.test(readCode(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('NO page/component imports a writable calendar store, the persistence store, or write APIs', () => {
    const FORBIDDEN =
      /\bAppendOnlyPersistenceStore\b|\bInMemoryAppendOnlyPersistenceStore\b|\bPersistenceBackedCalendarStore\b|\bAppendOnlyCalendarStore\b|\brunCalendarIngestion\b|\brunRecordedCalendarIngestion\b|\bappendRevision\b|\bappendSupersession\b/;
    const offenders = [...scanDir('src/pages'), ...scanDir('src/components')].filter((f) =>
      FORBIDDEN.test(readCode(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('the legacy AppendOnlyCalendarStore remains available for isolated tests', () => {
    const def = read(LEGACY_DEF);
    expect(def).toMatch(/export class AppendOnlyCalendarStore/);
  });
});

describe('J. Calendar page bootstrap lifecycle (per-session, not per-mount)', () => {
  it('mounting the Calendar page twice does not double counts and does not throw', () => {
    const revCountBefore = calendarRichBootstrapStore.revisions.length;
    const supCountBefore = calendarRichBootstrapStore.supersessionEvents.length;

    const first = render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>,
    );
    const cardsFirst = first.container.querySelectorAll('[data-testid^="calendar-event-"]').length;
    first.unmount();

    expect(() =>
      render(
        <MemoryRouter>
          <Calendar />
        </MemoryRouter>,
      ),
    ).not.toThrow();
    const cardsSecond = screen.getAllByTestId(/^calendar-event-/).length;

    expect(calendarRichBootstrapStore.revisions.length).toBe(revCountBefore);
    expect(calendarRichBootstrapStore.supersessionEvents.length).toBe(supCountBefore);
    expect(cardsSecond).toBe(cardsFirst);
  });

  it('the prepared bootstrap views are frozen + stable (single session-level run)', () => {
    expect(Object.isFrozen(CALENDAR_RICH_EVENT_VIEWS)).toBe(true);
    expect(CALENDAR_RICH_EVENT_VIEWS.length).toBeGreaterThan(0);

    const cpi = CALENDAR_RICH_EVENT_VIEWS.find((v) => v.current.sourceEventId === CPI);
    expect(cpi).toBeDefined();
    expect(cpi!.history.length).toBeGreaterThanOrEqual(2);
  });
});
