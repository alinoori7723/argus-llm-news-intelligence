export const SOURCE_READINESS_RULE_VERSION = 'source-readiness-rule-v1';
export const FETCH_CONTRACT_VERSION = 'fetch-contract-v1';

export type SourceKind = 'rss' | 'calendar' | 'news_site' | 'social' | 'other';

export type ReadinessApprovalStatus = 'allowed' | 'needs_review' | 'blocked' | 'unknown';

export type AcquisitionMode = 'recorded_fixture' | 'manual_recording_ready' | 'live_fetch_deferred';

export type ParserSupport = 'supported' | 'unsupported' | 'unknown';

export type SourceRuntimeMode = 'recorded_fixture_only';

export type SourceAuthority =
  | 'official_primary_source'
  | 'reputable_secondary'
  | 'curated'
  | 'unknown';

export interface SourceReadinessProfile {
  sourceId: string;
  sourceName: string;
  sourceKind: SourceKind;
  enabled: boolean;
  legalStatus: ReadinessApprovalStatus;
  tosStatus: ReadinessApprovalStatus;
  acquisitionMode: AcquisitionMode;
  parserSupport: ParserSupport;
  maxPayloadBytes?: number;
  allowedContentTypes: string[];
  timeoutMs?: number;
  retryPolicyId: string;
  notes?: string;

  sourceUrl?: string;

  runtimeMode?: SourceRuntimeMode;

  legalEvidenceNote?: string;

  sourceAuthority?: SourceAuthority;
}

export type SourceReadinessSkipReason =
  | 'source_disabled'
  | 'source_not_enabled'
  | 'source_missing_legal_status'
  | 'source_legal_needs_review'
  | 'source_legal_blocked'
  | 'source_legal_unknown'
  | 'tos_missing'
  | 'tos_needs_review'
  | 'tos_blocked'
  | 'tos_unknown'
  | 'parser_unsupported'
  | 'acquisition_mode_not_offline_ready'
  | 'content_type_unsupported'
  | 'max_payload_missing'
  | 'timeout_missing';

export interface SourceReadinessDecision {
  sourceId: string;
  status: 'eligible' | 'skipped';
  skipReason?: SourceReadinessSkipReason;
  deterministicInputs: string[];
  ruleVersion: string;
}

export interface SourceFetchRequest {
  runId: string;
  sourceId: string;
  sourceUrl: string;
  requestedAt: string;
  timeoutMs: number;
  maxPayloadBytes: number;
  acceptedContentTypes: string[];
  ruleVersion: string;
}

export type SourceFetchOutcomeStatus = 'fetched' | 'skipped' | 'failed' | 'quarantined';

export type SourceFetchFailureCode =
  | 'network_timeout'
  | 'network_unavailable_simulated'
  | 'http_status_failure'
  | 'unsupported_content_type'
  | 'payload_too_large'
  | 'empty_payload'
  | 'malformed_payload'
  | 'source_not_eligible'
  | 'parser_unsupported'
  | 'legal_not_allowed'
  | 'tos_not_allowed'
  | 'transport_unavailable'
  | 'unknown_failure';

export interface SourceFetchFailure {
  failureCode: SourceFetchFailureCode;
  sourceId: string;
  runId: string;
  observedAt: string;
  retryable: boolean;
  quarantineRequired: boolean;
  reason: string;
  ruleVersion: string;
}

export type RawPayloadStatus = 'recorded' | 'quarantined' | 'rejected';

export interface RawSourcePayloadEnvelope {
  payloadId: string;
  runId: string;
  sourceId: string;
  observedAt: string;
  contentType: string;
  byteLength: number;
  payloadHash: string;

  payloadText?: string;
  payloadRef?: string;
  sourceReadinessRuleVersion: string;
  fetchContractVersion: string;
  parserVersion?: string;
  status: RawPayloadStatus;
  quarantineReason?: string;
}

export interface SourceFetchOutcome {
  status: SourceFetchOutcomeStatus;
  sourceId: string;
  runId: string;
  observedAt: string;
  payload?: RawSourcePayloadEnvelope;
  failure?: SourceFetchFailure;
  deterministicInputs: string[];
  ruleVersion: string;
}

export interface SourceQuarantineRecord {
  quarantineId: string;
  runId: string;
  sourceId: string;
  payloadId?: string;
  failureCode: SourceFetchFailureCode;
  reason: string;
  observedAt: string;
  retryable: boolean;
  reviewRequired: boolean;
  ruleVersion: string;
  deterministicInputs: string[];
}

export interface RetryPolicy {
  retryPolicyId: string;
  maxAttempts: number;
  baseDelayMs: number;
  backoffFactor: number;
  maxDelayMs: number;
  retryableFailureCodes: SourceFetchFailureCode[];
}

export interface SourceRetryPlan {
  sourceId: string;
  runId: string;
  failureCode: SourceFetchFailureCode;
  attempt: number;
  shouldRetry: boolean;
  nextAttemptAt?: string;
  delayMs?: number;
  reason: string;
  ruleVersion: string;
}

export interface SourceReadinessRunRecord {
  runId: string;
  sourceId: string;
  status: SourceFetchOutcomeStatus;
  observedAt: string;
  ruleVersion: string;
}

export interface SourceReadinessRunResult {
  runId: string;
  sourceId: string;
  decision: SourceReadinessDecision;
  outcome: SourceFetchOutcome;
  retryPlan?: SourceRetryPlan;
  ruleVersion: string;
}

export interface SourceReadinessSnapshot {
  runs: readonly SourceReadinessRunRecord[];
  decisions: readonly SourceReadinessDecision[];
  payloads: readonly RawSourcePayloadEnvelope[];
  failures: readonly SourceFetchFailure[];
  quarantines: readonly SourceQuarantineRecord[];
  retryPlans: readonly SourceRetryPlan[];
  ruleVersion: string;
}

export interface SourceReadinessStore {
  appendRun(record: SourceReadinessRunRecord): void;
  appendDecision(record: SourceReadinessDecision): void;
  appendPayload(record: RawSourcePayloadEnvelope): void;
  appendFailure(record: SourceFetchFailure): void;
  appendQuarantine(record: SourceQuarantineRecord): void;
  appendRetryPlan(record: SourceRetryPlan): void;
  getSnapshot(): SourceReadinessSnapshot;
}
