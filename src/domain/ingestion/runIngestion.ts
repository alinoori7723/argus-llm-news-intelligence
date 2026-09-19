import type { SourceProfile } from '../types';
import { skipReasonFor } from './selection';
import { parseRss } from './parseRss';
import { normalizeParsedItems } from './normalize';
import {
  RSS_PARSER_VERSION,
  type Clock,
  type IngestionRun,
  type IngestionRunStatus,
  type IngestionStore,
  type RawSourcePayload,
  type SourceFetcher,
} from './types';

const DEFAULT_CONTENT_TYPE = 'application/rss+xml';

const recordSkipped = (
  source: SourceProfile,
  store: IngestionStore,
  clock: Clock,
  fetcherVersion: string,
  startedAt: string,
): IngestionRun => {
  const run: IngestionRun = {
    ingestionRunId: store.nextId(`run-${source.sourceId}`),
    sourceId: source.sourceId,
    startedAt,
    finishedAt: clock.now().toISOString(),
    status: 'skipped',
    legalStatusAtRun: source.legalStatus,
    skipReason: skipReasonFor(source) ?? undefined,
    parserVersion: RSS_PARSER_VERSION,
    fetcherVersion,
    rawPayloadIds: [],
    normalizedItemIds: [],
    malformedItemIds: [],
    warnings: [],
  };
  store.recordRun(run);
  return run;
};

const statusFor = (parsedCount: number, malformedCount: number): IngestionRunStatus => {
  if (parsedCount === 0) return 'failed';
  return malformedCount > 0 ? 'partial_success' : 'success';
};

export interface IngestPayloadInput {
  source: SourceProfile;
  payloadText: string;
  contentType?: string;
  sourceUrl?: string;
  fetcherVersion: string;
  store: IngestionStore;
  clock: Clock;

  startedAt?: string;
  parserVersion?: string;
  processingVersion?: string;
}

const unsafeIngestAllowedPayloadText = (input: IngestPayloadInput): IngestionRun => {
  const {
    source,
    payloadText,
    store,
    clock,
    fetcherVersion,
    contentType = DEFAULT_CONTENT_TYPE,
    sourceUrl,
  } = input;
  const startedAt = input.startedAt ?? clock.now().toISOString();
  const parserVersion = input.parserVersion ?? RSS_PARSER_VERSION;
  const fetchedAt = clock.now().toISOString();
  const observedAt = fetchedAt;
  const rawPayloadId = store.nextId(`raw-${source.sourceId}`);

  const parse = parseRss(payloadText, {
    sourceId: source.sourceId,
    rawPayloadId,
    observedAt,
    now: clock.now(),
    parserVersion,
  });

  const payload: RawSourcePayload = {
    rawPayloadId,
    sourceId: source.sourceId,
    fetchedAt,
    observedAt,
    payloadText,
    contentType,
    fetcherVersion,
    sourceUrl,
    status: parse.ok ? 'fetched' : 'quarantined',
    failureReason: parse.ok ? undefined : 'malformed_xml',

    parserVersion,
  };
  store.appendRawPayload(payload);

  if (!parse.ok) {
    const run: IngestionRun = {
      ingestionRunId: store.nextId(`run-${source.sourceId}`),
      sourceId: source.sourceId,
      startedAt,
      finishedAt: clock.now().toISOString(),
      status: 'failed',
      legalStatusAtRun: source.legalStatus,
      parserVersion,
      fetcherVersion,
      rawPayloadIds: [rawPayloadId],
      normalizedItemIds: [],
      malformedItemIds: [],
      warnings: parse.warnings,
      failureReason: 'malformed_xml',
    };
    store.recordRun(run);
    return run;
  }

  const ingestedAt = clock.now().toISOString();
  const normalizedAt = ingestedAt;
  const normalized = normalizeParsedItems(parse.parsedItems, {
    source,
    observedAt,
    ingestedAt,
    normalizedAt,
    processingVersion: input.processingVersion,
  });
  store.appendNormalizedItems(normalized);
  store.appendMalformedItems(parse.malformedItems);

  const run: IngestionRun = {
    ingestionRunId: store.nextId(`run-${source.sourceId}`),
    sourceId: source.sourceId,
    startedAt,
    finishedAt: clock.now().toISOString(),
    status: statusFor(parse.parsedItems.length, parse.malformedItems.length),
    legalStatusAtRun: source.legalStatus,
    parserVersion,
    fetcherVersion,
    rawPayloadIds: [rawPayloadId],
    normalizedItemIds: normalized.map((n) => n.itemId),
    malformedItemIds: parse.malformedItems.map((m) => m.malformedItemId),
    warnings: parse.warnings,
  };
  store.recordRun(run);
  return run;
};

export const ingestPayloadText = (input: IngestPayloadInput): IngestionRun => {
  const startedAt = input.startedAt ?? input.clock.now().toISOString();
  if (skipReasonFor(input.source) !== null) {
    return recordSkipped(input.source, input.store, input.clock, input.fetcherVersion, startedAt);
  }
  return unsafeIngestAllowedPayloadText({ ...input, startedAt });
};

export interface RunIngestionInput {
  source: SourceProfile;
  fetcher: SourceFetcher;
  store: IngestionStore;
  clock: Clock;
  parserVersion?: string;
  processingVersion?: string;
}

export const runIngestion = async (input: RunIngestionInput): Promise<IngestionRun> => {
  const { source, fetcher, store, clock } = input;
  const startedAt = clock.now().toISOString();

  if (skipReasonFor(source) !== null) {
    return recordSkipped(source, store, clock, fetcher.fetcherVersion, startedAt);
  }

  const outcome = await fetcher.fetch(source, { clock });

  if (outcome.status === 'failed') {
    const fetchedAt = clock.now().toISOString();
    const rawPayloadId = store.nextId(`raw-${source.sourceId}`);
    store.appendRawPayload({
      rawPayloadId,
      sourceId: source.sourceId,
      fetchedAt,
      observedAt: fetchedAt,
      contentType: outcome.contentType ?? DEFAULT_CONTENT_TYPE,
      fetcherVersion: fetcher.fetcherVersion,
      sourceUrl: outcome.sourceUrl,
      status: 'failed',
      failureReason: outcome.failureReason ?? 'fetch_failed',
    });
    const run: IngestionRun = {
      ingestionRunId: store.nextId(`run-${source.sourceId}`),
      sourceId: source.sourceId,
      startedAt,
      finishedAt: clock.now().toISOString(),
      status: 'failed',
      legalStatusAtRun: source.legalStatus,
      parserVersion: input.parserVersion ?? RSS_PARSER_VERSION,
      fetcherVersion: fetcher.fetcherVersion,
      rawPayloadIds: [rawPayloadId],
      normalizedItemIds: [],
      malformedItemIds: [],
      warnings: [],
      failureReason: outcome.failureReason ?? 'fetch_failed',
    };
    store.recordRun(run);
    return run;
  }

  return unsafeIngestAllowedPayloadText({
    source,
    payloadText: outcome.payloadText ?? '',
    contentType: outcome.contentType,
    sourceUrl: outcome.sourceUrl,
    fetcherVersion: fetcher.fetcherVersion,
    store,
    clock,
    startedAt,
    parserVersion: input.parserVersion,
    processingVersion: input.processingVersion,
  });
};

export const runIngestionBatch = async (
  sources: SourceProfile[],
  deps: Omit<RunIngestionInput, 'source'>,
): Promise<IngestionRun[]> => {
  const runs: IngestionRun[] = [];
  for (const source of sources) {
    runs.push(await runIngestion({ ...deps, source }));
  }
  return runs;
};

export const runRecordedIngestion = (args: {
  source: SourceProfile;
  payloadText: string;
  contentType?: string;
  sourceUrl?: string;
  fetcherVersion: string;
  store: IngestionStore;
  clock: Clock;
  parserVersion?: string;
  processingVersion?: string;
}): IngestionRun => {
  const startedAt = args.clock.now().toISOString();
  if (skipReasonFor(args.source) !== null) {
    return recordSkipped(args.source, args.store, args.clock, args.fetcherVersion, startedAt);
  }

  return unsafeIngestAllowedPayloadText({ ...args, startedAt });
};
