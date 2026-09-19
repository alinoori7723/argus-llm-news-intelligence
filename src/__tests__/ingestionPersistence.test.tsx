import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INGESTION_MALFORMED_ITEMS_STREAM,
  INGESTION_NORMALIZED_ITEMS_STREAM,
  INGESTION_RAW_PAYLOADS_STREAM,
  INGESTION_RUNS_STREAM,
  INGESTION_STREAM_ORDER,
  PersistenceBackedIngestionStore,
  buildIngestionSnapshot,
  fixedClock,
  mapMalformedItemToInput,
  mapNormalizedItemToInput,
  mapRawPayloadToInput,
  normalizeParsedItems,
  orderIngestionRecordsGlobally,
  parseRss,
  replayIngestionHistory,
  resolveIngestionLinkage,
  runIngestionBatch,
  runRecordedIngestion,
  type IngestionStore,
  type MalformedSourceItem,
  type NormalizedIngestedItem,
  type SourceFetcher,
} from '@/domain/ingestion';
import { InMemoryAppendOnlyPersistenceStore, type PersistedRecord } from '@/domain/persistence';
import { DEV_INGESTION_SOURCES, DEV_INGESTION_SOURCE_LIST } from '@/fixtures/rss/ingestionSources';
import { RecordedFixtureFetcher } from '@/ingestion/fetchers/recordedFixtureFetcher';
import type { SourceProfile } from '@/domain/types';
import Ingestion from '@/pages/Ingestion';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLOCK = fixedClock('2026-05-29T12:00:00.000Z');

const FIXTURE_FILE: Record<string, string> = {
  clean: 'clean-market-feed.xml',
  malformed: 'malformed-market-feed.xml',
  missingPubdate: 'missing-pubdate-feed.xml',
  futurePubdate: 'future-pubdate-feed.xml',
  brokenXml: 'broken-xml-feed.xml',
};
const readFixture = (name: string): string =>
  readFileSync(resolve(repoRoot, 'src/fixtures/rss', name), 'utf8');

const recordedFetcher = (): SourceFetcher => {
  const payloads: Record<string, { xml: string }> = {};
  for (const dev of DEV_INGESTION_SOURCES) {
    payloads[dev.source.sourceId] = { xml: readFixture(FIXTURE_FILE[dev.feedKey]) };
  }
  return new RecordedFixtureFetcher(payloads);
};

const cleanSource = (): SourceProfile =>
  DEV_INGESTION_SOURCE_LIST.find((s) => s.sourceId === 'src.rss.clean')!;

const newStore = (): { backing: InMemoryAppendOnlyPersistenceStore; store: IngestionStore } => {
  const backing = new InMemoryAppendOnlyPersistenceStore();
  return { backing, store: new PersistenceBackedIngestionStore(backing) };
};

const ingestClean = async () => {
  const { backing, store } = newStore();
  await runIngestionBatch([cleanSource()], { fetcher: recordedFetcher(), store, clock: CLOCK });
  return { backing, store };
};

describe('A. persistence-backed ingestion store maps to four separate streams', () => {
  it('raw → ingestion-raw-payloads; normalized → ingestion-normalized-items; malformed → ingestion-malformed-items; runs → ingestion-runs', async () => {
    const { backing } = await ingestClean();
    expect(backing.readStream(INGESTION_RAW_PAYLOADS_STREAM).length).toBe(1);
    expect(backing.readStream(INGESTION_NORMALIZED_ITEMS_STREAM).length).toBeGreaterThanOrEqual(5);
    expect(backing.readStream(INGESTION_RUNS_STREAM).length).toBe(1);
    expect(INGESTION_STREAM_ORDER).toEqual([
      'ingestion-raw-payloads',
      'ingestion-normalized-items',
      'ingestion-malformed-items',
      'ingestion-runs',
    ]);
  });

  it('a quarantined raw payload stays in the raw stream (status-based, NOT a separate quarantine stream)', () => {
    const { backing, store } = newStore();

    runRecordedIngestion({
      source: cleanSource(),
      payloadText: readFixture('broken-xml-feed.xml'),
      fetcherVersion: 'recorded-fixture-fetcher-v1',
      store,
      clock: CLOCK,
    });
    const raws = backing.readStream(INGESTION_RAW_PAYLOADS_STREAM);
    expect(raws).toHaveLength(1);
    expect((raws[0].payload as { status: string }).status).toBe('quarantined');

    expect(backing.readStream(INGESTION_NORMALIZED_ITEMS_STREAM)).toHaveLength(0);
  });

  it('malformed (per-item) records go ONLY to the malformed stream, never normalized', async () => {
    const { backing, store } = newStore();
    await runIngestionBatch(
      [DEV_INGESTION_SOURCE_LIST.find((s) => s.sourceId === 'src.rss.malformed')!],
      { fetcher: recordedFetcher(), store, clock: CLOCK },
    );
    expect(backing.readStream(INGESTION_MALFORMED_ITEMS_STREAM).length).toBeGreaterThan(0);

    const normalizedIds = new Set(
      backing.readStream(INGESTION_NORMALIZED_ITEMS_STREAM).map((r) => r.recordId),
    );
    for (const m of backing.readStream(INGESTION_MALFORMED_ITEMS_STREAM)) {
      expect(normalizedIds.has(m.recordId)).toBe(false);
    }
  });
});

describe('B. recordedAt is a pass-through of the correct domain timestamp', () => {
  it('raw envelope.recordedAt === rawPayload.observedAt', async () => {
    const { backing } = await ingestClean();
    const env = backing.readStream(INGESTION_RAW_PAYLOADS_STREAM)[0];
    expect(env.recordedAt).toBe((env.payload as { observedAt: string }).observedAt);
  });

  it('normalized envelope.recordedAt === normalizedItem.normalizedAt', async () => {
    const { backing } = await ingestClean();
    for (const env of backing.readStream(INGESTION_NORMALIZED_ITEMS_STREAM)) {
      const p = env.payload as NormalizedIngestedItem;
      expect(env.recordedAt).toBe(p.normalizedAt);

      expect(env.recordedAt).not.toBe(p.sourceEventTime);
    }
  });

  it('run envelope.recordedAt === run.finishedAt', async () => {
    const { backing } = await ingestClean();
    const env = backing.readStream(INGESTION_RUNS_STREAM)[0];
    expect(env.recordedAt).toBe((env.payload as { finishedAt: string }).finishedAt);
  });

  it('malformed envelope.recordedAt === malformedItem.quarantinedAt', () => {
    const malformed: MalformedSourceItem = {
      malformedItemId: 'mal-1',
      sourceId: 'src.x',
      rawPayloadId: 'raw-1',
      reason: 'bad_item',
      rawSnippet: '<item/>',
      parserVersion: 'rss-parser-v1',
      observedAt: '2026-05-29T11:00:00.000Z',
      quarantinedAt: '2026-05-29T12:00:00.000Z',
    };
    const input = mapMalformedItemToInput(malformed, 0);
    expect(input.recordedAt).toBe(malformed.quarantinedAt);
    expect(input.recordedAt).not.toBe(malformed.observedAt);
  });

  it('sourceEventTime is NEVER used as recordedAt and is preserved unchanged after replay', async () => {
    const { backing } = await ingestClean();
    const snapshot = replayIngestionHistory(backing.readAll());
    const withKnownTime = snapshot.normalizedItems.filter((n) => n.sourceEventTime !== null);
    expect(withKnownTime.length).toBeGreaterThan(0);
    for (const n of withKnownTime) {
      expect(n.sourceEventTime).not.toBe(n.normalizedAt);
      expect(n.sourceEventTime).not.toBe(n.observedAt);
      expect(n.sourceEventTime).not.toBe(n.ingestedAt);
    }

    const sample = withKnownTime[0];
    expect(typeof sample.sourceEventTime).toBe('string');
  });

  it('the mapping never samples a clock of its own (no Date.now / argless new Date / Clock in mapping source)', () => {
    const raw = readFileSync(
      resolve(repoRoot, 'src/domain/ingestion/ingestionPersistenceMapping.ts'),
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

describe('C. deterministic recordId includes the per-stream sequence', () => {
  const sameTickItems = (count: number): NormalizedIngestedItem[] => {
    const parsed = parseRss(readFixture('clean-market-feed.xml'), {
      sourceId: 'src.rss.clean',
      rawPayloadId: 'raw-batch-1',
      observedAt: '2026-05-29T12:00:00.000Z',
      now: CLOCK.now(),
    });

    const base = normalizeParsedItems(parsed.parsedItems, {
      source: cleanSource(),
      observedAt: '2026-05-29T12:00:00.000Z',
      ingestedAt: '2026-05-29T12:00:00.000Z',
      normalizedAt: '2026-05-29T12:00:00.000Z',
    });
    const out: NormalizedIngestedItem[] = [];
    for (let i = 0; i < count; i += 1) {
      const src = base[i % base.length];
      out.push({ ...src, itemId: `item-batch-${i}` });
    }
    return out;
  };

  it('a 20+ same-timestamp normalized batch persists with distinct recordIds, in input order, no false duplicate', () => {
    const { backing, store } = newStore();
    const items = sameTickItems(24);
    const stamp = items[0].normalizedAt;
    expect(items.every((n) => n.normalizedAt === stamp)).toBe(true);

    store.appendNormalizedItems(items);
    const recs = backing.readStream(INGESTION_NORMALIZED_ITEMS_STREAM);

    expect(recs).toHaveLength(24);
    expect(new Set(recs.map((r) => r.recordId)).size).toBe(24);
    expect(recs.map((r) => r.sequence)).toEqual([...Array(24).keys()]);

    expect(recs.map((r) => (r.payload as NormalizedIngestedItem).itemId)).toEqual(
      items.map((n) => n.itemId),
    );

    expect(recs.every((r) => r.recordedAt === stamp)).toBe(true);
  });

  it('the recordId matches the required per-stream patterns', async () => {
    const { backing } = await ingestClean();
    const raw = backing.readStream(INGESTION_RAW_PAYLOADS_STREAM)[0];
    const norm = backing.readStream(INGESTION_NORMALIZED_ITEMS_STREAM)[0];
    const run = backing.readStream(INGESTION_RUNS_STREAM)[0];
    expect(raw.recordId).toBe(
      `ingestion-raw-payload:0:${(raw.payload as { rawPayloadId: string }).rawPayloadId}`,
    );
    expect(norm.recordId).toBe(
      `ingestion-normalized-item:0:${(norm.payload as NormalizedIngestedItem).itemId}`,
    );
    expect(run.recordId).toBe(
      `ingestion-run:0:${(run.payload as { ingestionRunId: string }).ingestionRunId}`,
    );

    const rawPayload = raw.payload as never as Parameters<typeof mapRawPayloadToInput>[0];
    expect(mapRawPayloadToInput(rawPayload, 9).recordId).toBe(
      `ingestion-raw-payload:9:${rawPayload.rawPayloadId}`,
    );
  });

  it('a TRUE duplicate persisted recordId is still rejected by the underlying store', () => {
    const backing = new InMemoryAppendOnlyPersistenceStore();
    const norm = mapNormalizedItemToInput(
      {
        itemId: 'dup-1',
        sourceId: 'src.x',
        sourceItemId: 's1',
        sourceEventTime: null,
        sourceEventTimeStatus: 'unknown',
        observedAt: 't',
        ingestedAt: 't',
        normalizedAt: '2026-05-29T12:00:00.000Z',
        title: 't',
        language: 'en',
        tags: [],
        verificationTier: 'reported',
        freshnessState: 'live',
        dedupeHash: 'h',
        rawPayloadId: 'raw-1',
        parserVersion: 'rss-parser-v1',
        processingVersion: 'ingest-normalize-v1',
      },
      0,
    );
    backing.append(norm);
    expect(() => backing.append(norm)).toThrow(/duplicate recordId/);
  });
});

describe('D. replay from persisted records reproduces ingestion state', () => {
  it('replay(records) reconstructs the same raw/normalized/malformed/run arrays as direct store reads', async () => {
    const { backing, store } = await ingestClean();
    const snap = replayIngestionHistory(backing.readAll());
    expect(snap.rawPayloads).toEqual(store.rawPayloads);
    expect(snap.normalizedItems).toEqual(store.normalizedItems);
    expect(snap.malformedItems).toEqual(store.malformedItems);
    expect(snap.runs).toEqual(store.runs);
  });

  it('replay is deterministic and order-insensitive (shuffled input → same snapshot)', async () => {
    const { backing } = await ingestClean();
    const records = backing.readAll();
    const shuffled = [...records].reverse();
    expect(replayIngestionHistory(shuffled)).toEqual(replayIngestionHistory(records));
  });

  it('shuffled replay preserves stable normalized item order (by per-stream sequence)', async () => {
    const { backing, store } = await ingestClean();
    const directOrder = store.normalizedItems.map((n) => n.itemId);
    const shuffled = orderIngestionRecordsGlobally([...backing.readAll()].reverse());
    const replayed = replayIngestionHistory(shuffled).normalizedItems.map((n) => n.itemId);
    expect(replayed).toEqual(directOrder);
  });

  it('replay does NOT mutate the input records', async () => {
    const { backing } = await ingestClean();
    const records = backing.readAll();
    const before = JSON.stringify(records);
    replayIngestionHistory(records);
    expect(JSON.stringify(records)).toBe(before);
  });

  it('replayed snapshot + records are frozen (defensive); mutating it does not affect later reads', async () => {
    const { backing } = await ingestClean();
    const snap = replayIngestionHistory(backing.readAll());
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.normalizedItems)).toBe(true);
    expect(snap.normalizedItems.every((n) => Object.isFrozen(n))).toBe(true);
    expect(snap.rawPayloads.every((p) => Object.isFrozen(p))).toBe(true);
    try {
      (snap.normalizedItems as unknown as unknown[]).push({ tampered: true });
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
    }
    expect(replayIngestionHistory(backing.readAll()).normalizedItems.length).toBe(
      snap.normalizedItems.length,
    );
  });

  it('records from a foreign stream do NOT leak into ingestion state', async () => {
    const { backing } = await ingestClean();
    const beforeNormalized = replayIngestionHistory(backing.readAll()).normalizedItems.length;
    backing.append({
      recordId: 'foreign-0',
      streamName: 'whisper-decisions',
      schemaVersion: 'x',
      producerVersion: 'x',
      sourcePhase: 'phase-2-15-test',
      payload: { decisionId: 'd', candidateId: 'c' },
      recordedAt: '2026-05-29T12:00:00.000Z',
    });

    const snap = buildIngestionSnapshot(backing.readAll());
    expect(snap.normalizedItems).toHaveLength(beforeNormalized);
    expect(snap.runs.every((r) => 'ingestionRunId' in r)).toBe(true);
  });

  it('replayIngestionHistory REJECTS an unknown stream with a deterministic reason', () => {
    const foreign: PersistedRecord = {
      recordId: 'foreign-0',
      streamName: 'whisper-decisions',
      sequence: 0,
      recordedAt: '2026-05-29T12:00:00.000Z',
      schemaVersion: 'x',
      producerVersion: 'x',
      payloadHash: '0',
      sourcePhase: 'p',
      payload: {},
      contractVersion: 'persistence-contract-v1',
    };
    expect(() => replayIngestionHistory([foreign])).toThrow(/unknown stream/);
  });

  it('replay rejects duplicate recordId and non-contiguous per-stream sequence', async () => {
    const { backing } = await ingestClean();
    const records = backing.readAll();
    const run = records.find((r) => r.streamName === INGESTION_RUNS_STREAM)!;
    expect(() => replayIngestionHistory([run, run])).toThrow(/duplicate recordId/);
    const broken: PersistedRecord = { ...run, recordId: 'run-seq-1-only', sequence: 1 };
    expect(() => buildIngestionSnapshot([broken])).toThrow(/non-contiguous sequence/);
  });
});

describe('E. raw payload ⇄ normalized item linkage survives replay', () => {
  it('every normalized item rawPayloadId resolves to an existing raw payload after replay', async () => {
    const { backing } = await ingestClean();
    const snap = replayIngestionHistory(backing.readAll());
    const linkage = resolveIngestionLinkage(snap);
    expect(linkage.ok).toBe(true);
    expect(linkage.unresolvedItemIds).toEqual([]);
  });

  it('shuffled replay still preserves rawPayloadId linkage', async () => {
    const { backing } = await ingestClean();
    const snap = replayIngestionHistory([...backing.readAll()].reverse());
    expect(resolveIngestionLinkage(snap).ok).toBe(true);
  });

  it('a missing rawPayloadId is marked unresolved EXPLICITLY (never silently dropped/fabricated)', async () => {
    const { backing } = await ingestClean();
    const snap = buildIngestionSnapshot(backing.readAll());

    const broken = {
      ...snap,
      normalizedItems: [
        ...snap.normalizedItems,
        { ...snap.normalizedItems[0], itemId: 'orphan', rawPayloadId: 'raw-does-not-exist' },
      ],
    };
    const linkage = resolveIngestionLinkage(broken);
    expect(linkage.ok).toBe(false);
    expect(linkage.unresolvedItemIds).toContain('orphan');

    expect(broken.rawPayloads.some((p) => p.rawPayloadId === 'raw-does-not-exist')).toBe(false);
  });
});

describe('F. dedupeHash and payloadHash are different concepts', () => {
  it('normalized item dedupeHash is preserved unchanged after replay', async () => {
    const { backing, store } = await ingestClean();
    const before = store.normalizedItems.map((n) => n.dedupeHash);
    const after = replayIngestionHistory(backing.readAll()).normalizedItems.map(
      (n) => n.dedupeHash,
    );
    expect(after).toEqual(before);
    expect(before.every((h) => typeof h === 'string' && h.length > 0)).toBe(true);
  });

  it('payloadHash exists on the persistence envelope but is NOT copied into domain dedupeHash', async () => {
    const { backing } = await ingestClean();
    for (const env of backing.readStream(INGESTION_NORMALIZED_ITEMS_STREAM)) {
      expect(typeof env.payloadHash).toBe('string');
      expect((env.payload as NormalizedIngestedItem).dedupeHash).not.toBe(env.payloadHash);
    }
  });

  it('no clustering/priority/selector code reads the persistence payloadHash', () => {
    const scanDir = (rel: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(join(repoRoot, rel), { withFileTypes: true })) {
        const relPath = join(rel, entry.name);
        if (entry.isDirectory()) out.push(...scanDir(relPath));
        else if (/\.(ts|tsx)$/.test(entry.name)) out.push(relPath);
      }
      return out;
    };

    const targets = [
      ...scanDir(join('src', 'domain', 'clustering')),
      ...scanDir(join('src', 'domain', 'display')),
    ];
    const offenders = targets.filter((f) =>
      /\bpayloadHash\b/.test(readFileSync(join(repoRoot, f), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('G. legalStatus pre-fetch gate remains authoritative', () => {
  it('needs_review + disabled sources are skipped and persist NO normalized items', async () => {
    const { backing, store } = newStore();
    const runs = await runIngestionBatch(DEV_INGESTION_SOURCE_LIST, {
      fetcher: recordedFetcher(),
      store,
      clock: CLOCK,
    });
    const skipped = runs.filter((r) => r.status === 'skipped').map((r) => r.sourceId);
    expect(skipped).toContain('src.rss.review');
    expect(skipped).toContain('src.rss.disabled');
    const producedSourceIds = new Set(
      backing
        .readStream(INGESTION_NORMALIZED_ITEMS_STREAM)
        .map((r) => (r.payload as NormalizedIngestedItem).sourceId),
    );
    expect(producedSourceIds.has('src.rss.review')).toBe(false);
    expect(producedSourceIds.has('src.rss.disabled')).toBe(false);

    const rawSources = new Set(
      backing.readStream(INGESTION_RAW_PAYLOADS_STREAM).map((r) => r.streamKey),
    );
    expect(rawSources.has('src.rss.review')).toBe(false);
    expect(rawSources.has('src.rss.disabled')).toBe(false);
  });
});

describe('H. Ingestion page bootstrap lifecycle (per-session, not per-mount)', () => {
  const run = (sourceId: string) => screen.getByTestId(`ingestion-run-${sourceId}`);

  it('mounting the page twice does not double counts and does not throw a duplicate-recordId error', () => {
    const first = render(
      <MemoryRouter>
        <Ingestion />
      </MemoryRouter>,
    );
    const cleanFirst = run('src.rss.clean').getAttribute('data-normalized-count');
    const rawRefFirst = screen
      .getByTestId('ingestion-run-src.rss.clean')
      .querySelector('[data-field="rawPayloadRef"]')?.textContent;
    first.unmount();

    expect(() =>
      render(
        <MemoryRouter>
          <Ingestion />
        </MemoryRouter>,
      ),
    ).not.toThrow();
    const cleanSecond = run('src.rss.clean').getAttribute('data-normalized-count');
    const rawRefSecond = screen
      .getByTestId('ingestion-run-src.rss.clean')
      .querySelector('[data-field="rawPayloadRef"]')?.textContent;

    expect(cleanSecond).toBe(cleanFirst);
    expect(rawRefSecond).toBe(rawRefFirst);
  });

  it('the bootstrap prepared view is stable + frozen (single session-level run)', async () => {
    const { INGESTION_DIAGNOSTICS_VIEW } = await import('@/fixtures/ingestion/ingestionBootstrap');
    expect(Object.isFrozen(INGESTION_DIAGNOSTICS_VIEW)).toBe(true);
    expect(Object.isFrozen(INGESTION_DIAGNOSTICS_VIEW.runs)).toBe(true);
    expect(INGESTION_DIAGNOSTICS_VIEW.rawPayloadCount).toBeGreaterThan(0);

    const cleanRun = INGESTION_DIAGNOSTICS_VIEW.runs.find((r) => r.sourceId === 'src.rss.clean')!;
    expect(cleanRun.status).toBe('success');
    expect(cleanRun.normalizedItemIds.length).toBeGreaterThanOrEqual(5);
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
  const LEGACY_DEF = join('src', 'domain', 'ingestion', 'store.ts');
  const PAGE = 'src/pages/Ingestion.tsx';
  const BOOTSTRAP = 'src/fixtures/ingestion/ingestionBootstrap.ts';

  it('PRESENCE: the ingestion bootstrap wires the persistence-backed store', () => {
    const code = read(BOOTSTRAP);
    expect(code).toMatch(/new PersistenceBackedIngestionStore\(/);
    expect(code).toMatch(/InMemoryAppendOnlyPersistenceStore/);
    expect(code).not.toMatch(/new AppendOnlyIngestionStore\(/);
  });

  it('ABSENCE: the Ingestion page constructs NO store and runs NO ingestion writes on render', () => {
    const code = read(PAGE);
    expect(code).not.toMatch(/new AppendOnlyIngestionStore\(/);
    expect(code).not.toMatch(/new PersistenceBackedIngestionStore\(/);
    expect(code).not.toMatch(/\brunRecordedIngestion\b|\brunIngestion\b|\brunIngestionBatch\b/);

    expect(code).toMatch(/INGESTION_DIAGNOSTICS_VIEW/);
  });

  it('AppendOnlyIngestionStore is referenced in CODE ONLY by its own definition in active non-test src', () => {
    const offenders = activeSrc.filter(
      (f) => f !== LEGACY_DEF && /\bAppendOnlyIngestionStore\b/.test(readCode(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('NO page/component imports a writable ingestion store or the persistence store', () => {
    const FORBIDDEN =
      /\bAppendOnlyPersistenceStore\b|\bInMemoryAppendOnlyPersistenceStore\b|\bPersistenceBackedIngestionStore\b|\bAppendOnlyIngestionStore\b|\brunIngestion\b|\brunRecordedIngestion\b|\brunIngestionBatch\b|\bappendNormalizedItems\b/;
    const offenders = [...scanDir('src/pages'), ...scanDir('src/components')].filter((f) =>
      FORBIDDEN.test(readCode(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('the legacy AppendOnlyIngestionStore remains available for isolated tests', () => {
    const def = read(LEGACY_DEF);
    expect(def).toMatch(/export class AppendOnlyIngestionStore/);
  });
});
