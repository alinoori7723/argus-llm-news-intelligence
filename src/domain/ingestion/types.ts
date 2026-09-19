import type { FreshnessState, SourceProfile, Tag, VerificationTier } from '../types';

export const RSS_PARSER_VERSION = 'rss-parser-v1';

export const INGESTION_PROCESSING_VERSION = 'ingest-normalize-v1';

export const SUPPORTED_SOURCE_TYPES: ReadonlySet<SourceProfile['sourceType']> = new Set<
  SourceProfile['sourceType']
>(['rss_fixture']);

export interface Clock {
  now(): Date;
}

export type SkipReason =
  | 'not_enabled'
  | 'legal_status_needs_review'
  | 'legal_status_disabled'
  | 'unsupported_source_type';

export type RawPayloadStatus = 'fetched' | 'skipped' | 'failed' | 'quarantined';

export interface RawSourcePayload {
  rawPayloadId: string;
  sourceId: string;
  fetchedAt: string;
  observedAt: string;
  payloadText?: string;
  payloadRef?: string;
  contentType: string;
  fetcherVersion: string;
  sourceUrl?: string;
  status: RawPayloadStatus;
  failureReason?: string;

  parserVersion?: string;
}

export interface FetchOutcome {
  status: 'fetched' | 'failed';
  payloadText?: string;
  contentType?: string;
  sourceUrl?: string;
  failureReason?: string;
}

export interface FetchContext {
  clock: Clock;
}

export interface SourceFetcher {
  readonly fetcherVersion: string;
  fetch(source: SourceProfile, ctx: FetchContext): Promise<FetchOutcome>;
}

export type PubDateState = 'valid' | 'missing' | 'invalid' | 'future';

export interface ParsedRssItem {
  sourceItemId: string;
  title: string;
  excerpt?: string;
  link?: string;

  sourceEventTime: string | null;
  pubDateState: PubDateState;
  authorOrPublisher?: string;
  rawGuid?: string;
  rawPubDate?: string;
  rawPayloadId: string;
  parserVersion: string;
}

export interface MalformedSourceItem {
  malformedItemId: string;
  sourceId: string;
  rawPayloadId: string;
  reason: string;
  rawSnippet: string;
  parserVersion: string;
  observedAt: string;
  quarantinedAt: string;
}

export interface ParseWarning {
  code: string;
  message: string;
  sourceItemId?: string;
}

export interface ParseResult {
  parserVersion: string;
  sourceId: string;

  ok: boolean;
  parsedItems: ParsedRssItem[];
  malformedItems: MalformedSourceItem[];
  warnings: ParseWarning[];
}

export type SourceEventTimeStatus = 'known' | 'unknown' | 'caveat_future';

export interface NormalizedIngestedItem {
  itemId: string;
  sourceId: string;
  sourceItemId: string;
  sourceEventTime: string | null;
  sourceEventTimeStatus: SourceEventTimeStatus;
  observedAt: string;
  ingestedAt: string;
  normalizedAt: string;
  title: string;
  excerpt?: string;
  url?: string;
  authorOrPublisher?: string;
  language: string;
  tags: Tag[];
  verificationTier: VerificationTier;
  freshnessState: FreshnessState;
  dedupeHash: string;
  rawPayloadId: string;
  parserVersion: string;
  processingVersion: string;
}

export type IngestionRunStatus = 'skipped' | 'success' | 'partial_success' | 'failed';

export interface IngestionRun {
  ingestionRunId: string;
  sourceId: string;
  startedAt: string;
  finishedAt: string;
  status: IngestionRunStatus;
  legalStatusAtRun: SourceProfile['legalStatus'];

  skipReason?: SkipReason;
  parserVersion: string;
  fetcherVersion: string;
  rawPayloadIds: string[];
  normalizedItemIds: string[];
  malformedItemIds: string[];
  warnings: ParseWarning[];
  failureReason?: string;
}

export interface IngestionStore {
  nextId(prefix: string): string;
  appendRawPayload(payload: RawSourcePayload): void;
  appendNormalizedItems(items: NormalizedIngestedItem[]): void;
  appendMalformedItems(items: MalformedSourceItem[]): void;
  recordRun(run: IngestionRun): void;
  readonly rawPayloads: readonly RawSourcePayload[];
  readonly normalizedItems: readonly NormalizedIngestedItem[];
  readonly malformedItems: readonly MalformedSourceItem[];
  readonly runs: readonly IngestionRun[];
  rawPayloadsForSource(sourceId: string): readonly RawSourcePayload[];
}
