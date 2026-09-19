import type { SourceProfile } from '../types';
import type { Clock, FetchContext, RawSourcePayload, SourceFetcher } from '../ingestion/types';
import { calendarSkipReasonFor } from './selection';
import { parseCalendar } from './parseCalendar';
import { decideCalendarChange } from './versioning';
import type { CalendarStore } from './store';
import {
  CALENDAR_SUPERSESSION_RULE_VERSION,
  supersessionReasonFromChangeReason,
} from './calendarSupersessionEvents';
import {
  CALENDAR_PARSER_VERSION,
  CALENDAR_PROCESSING_VERSION,
  type CalendarEventRevision,
  type CalendarIngestionRun,
  type CalendarIngestionRunStatus,
} from './types';

const DEFAULT_CONTENT_TYPE = 'application/json';

const recordCalendarSkipped = (
  source: SourceProfile,
  store: CalendarStore,
  clock: Clock,
  startedAt: string,
): CalendarIngestionRun => {
  const run: CalendarIngestionRun = {
    ingestionRunId: store.nextId(`cal-run-${source.sourceId}`),
    sourceId: source.sourceId,
    startedAt,
    finishedAt: clock.now().toISOString(),
    status: 'skipped',
    legalStatusAtRun: source.legalStatus,
    skipReason: calendarSkipReasonFor(source) ?? undefined,
    parserVersion: CALENDAR_PARSER_VERSION,
    processingVersion: CALENDAR_PROCESSING_VERSION,
    rawPayloadIds: [],
    createdRevisionIds: [],
    supersededRevisionIds: [],
    malformedRecordIds: [],
    unchangedConfirmationIds: [],
    warnings: [],
  };
  store.recordRun(run);
  return run;
};

const runStatusFor = (usableCount: number, malformedCount: number): CalendarIngestionRunStatus => {
  if (usableCount === 0) return 'failed';
  return malformedCount > 0 ? 'partial_success' : 'success';
};

export interface IngestCalendarPayloadInput {
  source: SourceProfile;
  payloadText: string;
  contentType?: string;
  sourceUrl?: string;
  fetcherVersion: string;
  store: CalendarStore;
  clock: Clock;
  startedAt?: string;
  parserVersion?: string;
  processingVersion?: string;
}

const unsafeIngestCalendarPayloadCore = (
  input: IngestCalendarPayloadInput,
): CalendarIngestionRun => {
  const { source, payloadText, store, clock, fetcherVersion } = input;
  const startedAt = input.startedAt ?? clock.now().toISOString();
  const parserVersion = input.parserVersion ?? CALENDAR_PARSER_VERSION;
  const processingVersion = input.processingVersion ?? CALENDAR_PROCESSING_VERSION;
  const stamp = clock.now().toISOString();
  const observedAt = stamp;
  const ingestedAt = stamp;
  const normalizedAt = stamp;
  const rawPayloadId = store.nextId(`cal-raw-${source.sourceId}`);

  const parse = parseCalendar(payloadText, {
    sourceId: source.sourceId,
    rawPayloadId,
    observedAt,
    now: clock.now(),
    parserVersion,
  });

  const payload: RawSourcePayload = {
    rawPayloadId,
    sourceId: source.sourceId,
    fetchedAt: observedAt,
    observedAt,
    payloadText,
    contentType: input.contentType ?? DEFAULT_CONTENT_TYPE,
    fetcherVersion,
    sourceUrl: input.sourceUrl,
    status: parse.ok ? 'fetched' : 'quarantined',
    failureReason: parse.ok ? undefined : 'malformed_calendar_payload',
    parserVersion,
  };
  store.appendRawPayload(payload);

  if (!parse.ok) {
    const run: CalendarIngestionRun = {
      ingestionRunId: store.nextId(`cal-run-${source.sourceId}`),
      sourceId: source.sourceId,
      startedAt,
      finishedAt: clock.now().toISOString(),
      status: 'failed',
      legalStatusAtRun: source.legalStatus,
      parserVersion,
      processingVersion,
      rawPayloadIds: [rawPayloadId],
      createdRevisionIds: [],
      supersededRevisionIds: [],
      malformedRecordIds: [],
      unchangedConfirmationIds: [],
      warnings: parse.warnings,
      failureReason: 'malformed_calendar_payload',
    };
    store.recordRun(run);
    return run;
  }

  store.appendSnapshot({
    snapshotId: store.nextId(`cal-snap-${source.sourceId}`),
    sourceId: source.sourceId,
    observedAt,
    rawPayloadId,
    parserVersion,
    eventCount: parse.parsedEvents.length,
    malformedCount: parse.malformedRecords.length,
    warningCount: parse.warnings.length,
  });

  const createdRevisionIds: string[] = [];
  const supersededRevisionIds: string[] = [];
  const unchangedConfirmationIds: string[] = [];

  for (const parsed of parse.parsedEvents) {
    const prior = store.currentRevisionFor(source.sourceId, parsed.sourceEventId);
    const decision = decideCalendarChange(parsed, prior);

    if (decision.action === 'confirm' && prior) {
      const confirmationId = store.nextId(`cal-conf-${source.sourceId}`);
      store.appendConfirmation({
        confirmationId,
        revisionId: prior.revisionId,
        sourceId: source.sourceId,
        sourceEventId: parsed.sourceEventId,
        confirmedAt: observedAt,
        rawPayloadId,
      });
      unchangedConfirmationIds.push(confirmationId);
      continue;
    }

    const revisionNumber = prior
      ? store.maxRevisionNumberFor(source.sourceId, parsed.sourceEventId) + 1
      : 1;
    const revisionId = store.nextId(`cal-rev-${source.sourceId}`);
    const revision: CalendarEventRevision = {
      revisionId,
      calendarEventId: `${source.sourceId}::${parsed.sourceEventId}`,
      sourceId: source.sourceId,
      sourceEventId: parsed.sourceEventId,
      canonicalEventKey: parsed.canonicalEventKey,
      revisionNumber,
      revisionStatus: decision.revisionStatus,
      scheduledFor: decision.scheduledFor,
      previousScheduledFor: decision.previousScheduledFor,
      observedAt,
      ingestedAt,
      normalizedAt,
      lastConfirmedAt: observedAt,
      sourceTimezone: parsed.sourceTimezone,
      eventName: parsed.eventName,
      country: parsed.country,
      currency: parsed.currency,
      eventCategory: parsed.eventCategory,
      importanceTier: parsed.importanceTier,
      values: parsed.values,
      sourceUrl: parsed.sourceUrl,
      parserVersion: parsed.parserVersion,
      processingVersion,
      rawPayloadId,
      supersedesRevisionId: prior?.revisionId,
      changeReason: decision.changeReason,
      warnings: parsed.warnings,
    };
    store.appendRevision(revision);
    createdRevisionIds.push(revisionId);
    if (prior) {
      store.appendSupersession({
        supersessionEventId: store.nextId(`cal-sup-${source.sourceId}`),
        calendarEventId: revision.calendarEventId,
        canonicalEventKey: revision.canonicalEventKey,
        sourceId: source.sourceId,
        sourceEventId: parsed.sourceEventId,
        supersededRevisionId: prior.revisionId,
        supersedingRevisionId: revisionId,
        reason: supersessionReasonFromChangeReason(decision.changeReason),
        observedAt,
        ruleVersion: CALENDAR_SUPERSESSION_RULE_VERSION,
        sourceUrl: parsed.sourceUrl,
      });
      supersededRevisionIds.push(prior.revisionId);
    }
  }

  store.appendMalformedRecords(parse.malformedRecords);

  const run: CalendarIngestionRun = {
    ingestionRunId: store.nextId(`cal-run-${source.sourceId}`),
    sourceId: source.sourceId,
    startedAt,
    finishedAt: clock.now().toISOString(),
    status: runStatusFor(parse.parsedEvents.length, parse.malformedRecords.length),
    legalStatusAtRun: source.legalStatus,
    parserVersion,
    processingVersion,
    rawPayloadIds: [rawPayloadId],
    createdRevisionIds,
    supersededRevisionIds,
    malformedRecordIds: parse.malformedRecords.map((m) => m.malformedCalendarRecordId),
    unchangedConfirmationIds,
    warnings: parse.warnings,
  };
  store.recordRun(run);
  return run;
};

export const runRecordedCalendarIngestion = (
  input: IngestCalendarPayloadInput,
): CalendarIngestionRun => {
  const startedAt = input.startedAt ?? input.clock.now().toISOString();
  if (calendarSkipReasonFor(input.source) !== null) {
    return recordCalendarSkipped(input.source, input.store, input.clock, startedAt);
  }
  return unsafeIngestCalendarPayloadCore({ ...input, startedAt });
};

export interface RunCalendarIngestionInput {
  source: SourceProfile;
  fetcher: SourceFetcher;
  store: CalendarStore;
  clock: Clock;
  parserVersion?: string;
  processingVersion?: string;
}

export const runCalendarIngestion = async (
  input: RunCalendarIngestionInput,
): Promise<CalendarIngestionRun> => {
  const { source, fetcher, store, clock } = input;
  const startedAt = clock.now().toISOString();

  if (calendarSkipReasonFor(source) !== null) {
    return recordCalendarSkipped(source, store, clock, startedAt);
  }

  const ctx: FetchContext = { clock };
  const outcome = await fetcher.fetch(source, ctx);

  if (outcome.status === 'failed') {
    const rawPayloadId = store.nextId(`cal-raw-${source.sourceId}`);
    const fetchedAt = clock.now().toISOString();
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
    const run: CalendarIngestionRun = {
      ingestionRunId: store.nextId(`cal-run-${source.sourceId}`),
      sourceId: source.sourceId,
      startedAt,
      finishedAt: clock.now().toISOString(),
      status: 'failed',
      legalStatusAtRun: source.legalStatus,
      parserVersion: input.parserVersion ?? CALENDAR_PARSER_VERSION,
      processingVersion: input.processingVersion ?? CALENDAR_PROCESSING_VERSION,
      rawPayloadIds: [rawPayloadId],
      createdRevisionIds: [],
      supersededRevisionIds: [],
      malformedRecordIds: [],
      unchangedConfirmationIds: [],
      warnings: [],
      failureReason: outcome.failureReason ?? 'fetch_failed',
    };
    store.recordRun(run);
    return run;
  }

  return unsafeIngestCalendarPayloadCore({
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
