import {
  PersistenceBackedIngestionStore,
  fixedClock,
  runRecordedIngestion,
  type IngestionRun,
} from '@/domain/ingestion';
import { InMemoryAppendOnlyPersistenceStore } from '@/domain/persistence';
import { DEV_INGESTION_SOURCES } from '@/fixtures/rss/ingestionSources';
import { RECORDED_FEED_XML } from '@/fixtures/rss/recordedFeeds';

export const INGESTION_DEMO_CLOCK_INSTANT = '2026-05-29T12:00:00.000Z';
const RECORDED_FETCHER_VERSION = 'recorded-fixture-fetcher-v1';

export const ingestionBootstrapStore = new PersistenceBackedIngestionStore(
  new InMemoryAppendOnlyPersistenceStore(),
);

const clock = fixedClock(INGESTION_DEMO_CLOCK_INSTANT);

const RUNS: IngestionRun[] = DEV_INGESTION_SOURCES.map((dev) =>
  runRecordedIngestion({
    source: dev.source,
    payloadText: RECORDED_FEED_XML[dev.feedKey],
    fetcherVersion: RECORDED_FETCHER_VERSION,
    store: ingestionBootstrapStore,
    clock,
  }),
);

const freezeRun = (run: IngestionRun): IngestionRun => {
  for (const value of Object.values(run)) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      if (Array.isArray(value))
        value.forEach((v) => {
          if (v !== null && typeof v === 'object') Object.freeze(v);
        });
      Object.freeze(value);
    }
  }
  return Object.freeze(run);
};

export interface IngestionDiagnosticsView {
  readonly clockInstant: string;
  readonly runs: readonly IngestionRun[];
  readonly rawPayloadCount: number;
  readonly normalizedItemCount: number;
  readonly malformedItemCount: number;
}

export const INGESTION_DIAGNOSTICS_VIEW: IngestionDiagnosticsView = Object.freeze({
  clockInstant: INGESTION_DEMO_CLOCK_INSTANT,
  runs: Object.freeze(RUNS.map(freezeRun)),

  rawPayloadCount: ingestionBootstrapStore.rawPayloads.length,
  normalizedItemCount: ingestionBootstrapStore.normalizedItems.length,
  malformedItemCount: ingestionBootstrapStore.malformedItems.length,
});
