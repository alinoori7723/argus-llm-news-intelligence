import {
  FETCH_CONTRACT_VERSION,
  SOURCE_READINESS_RULE_VERSION,
  type RawSourcePayloadEnvelope,
  type RetryPolicy,
  type SourceFetchFailure,
  type SourceFetchFailureCode,
  type SourceFetchOutcome,
  type SourceFetchRequest,
  type SourceQuarantineRecord,
  type SourceReadinessProfile,
  type SourceReadinessRunResult,
  type SourceReadinessStore,
} from './types';
import { deterministicHash, isoFromMs, type ReadinessClock } from './clock';
import { evaluateSourceReadinessEligibility } from './eligibility';
import { buildSourceQuarantineRecord } from './quarantine';
import { DEFAULT_RETRY_POLICY, planSourceRetry } from './retryPlan';
import type { FetchTransportResult, OfflineFetchTransport } from './fetchContract';

export interface RunOfflineSourceReadinessInput {
  sourceProfile: SourceReadinessProfile;
  transport: OfflineFetchTransport;
  clock: ReadinessClock;
  store: SourceReadinessStore;
  runId: string;
  sourceUrl?: string;
  attempt?: number;
  retryPolicy?: RetryPolicy;
}

const makeFailure = (
  failureCode: SourceFetchFailureCode,
  sourceId: string,
  runId: string,
  observedAt: string,
  retryable: boolean,
  quarantineRequired: boolean,
  reason: string,
): SourceFetchFailure => ({
  failureCode,
  sourceId,
  runId,
  observedAt,
  retryable,
  quarantineRequired,
  reason,
  ruleVersion: SOURCE_READINESS_RULE_VERSION,
});

export const runOfflineSourceReadiness = (
  input: RunOfflineSourceReadinessInput,
): SourceReadinessRunResult => {
  const { sourceProfile, transport, clock, store, runId } = input;
  const attempt = input.attempt ?? 1;
  const retryPolicy = input.retryPolicy ?? DEFAULT_RETRY_POLICY;
  const observedAt = isoFromMs(clock.now());
  const sourceId = sourceProfile.sourceId;

  const decision = evaluateSourceReadinessEligibility(sourceProfile);
  store.appendDecision(decision);

  if (decision.status === 'skipped') {
    const outcome: SourceFetchOutcome = {
      status: 'skipped',
      sourceId,
      runId,
      observedAt,
      deterministicInputs: [`skipReason=${decision.skipReason}`],
      ruleVersion: SOURCE_READINESS_RULE_VERSION,
    };
    store.appendRun({
      runId,
      sourceId,
      status: 'skipped',
      observedAt,
      ruleVersion: SOURCE_READINESS_RULE_VERSION,
    });
    return { runId, sourceId, decision, outcome, ruleVersion: SOURCE_READINESS_RULE_VERSION };
  }

  const request: SourceFetchRequest = {
    runId,
    sourceId,
    sourceUrl: input.sourceUrl ?? `recorded://${sourceId}`,
    requestedAt: observedAt,
    timeoutMs: sourceProfile.timeoutMs as number,
    maxPayloadBytes: sourceProfile.maxPayloadBytes as number,
    acceptedContentTypes: [...sourceProfile.allowedContentTypes],
    ruleVersion: FETCH_CONTRACT_VERSION,
  };

  let result: FetchTransportResult;
  try {
    result = transport.read(request);
  } catch {
    result = { kind: 'unavailable' };
  }

  const finalize = (
    outcome: SourceFetchOutcome,
    extras: {
      payload?: RawSourcePayloadEnvelope;
      failure?: SourceFetchFailure;
      quarantine?: SourceQuarantineRecord;
    } = {},
  ): SourceReadinessRunResult => {
    if (extras.payload) store.appendPayload(extras.payload);
    if (extras.failure) store.appendFailure(extras.failure);
    if (extras.quarantine) store.appendQuarantine(extras.quarantine);
    let retryPlan;
    if (extras.failure) {
      retryPlan = planSourceRetry({ failure: extras.failure, attempt, retryPolicy, clock });
      store.appendRetryPlan(retryPlan);
    }
    store.appendRun({
      runId,
      sourceId,
      status: outcome.status,
      observedAt,
      ruleVersion: SOURCE_READINESS_RULE_VERSION,
    });
    return {
      runId,
      sourceId,
      decision,
      outcome,
      retryPlan,
      ruleVersion: SOURCE_READINESS_RULE_VERSION,
    };
  };

  const baseOutcome = (
    status: SourceFetchOutcome['status'],
    inputs: string[],
  ): SourceFetchOutcome => ({
    status,
    sourceId,
    runId,
    observedAt,
    deterministicInputs: inputs,
    ruleVersion: SOURCE_READINESS_RULE_VERSION,
  });

  const failOutcome = (failure: SourceFetchFailure): SourceReadinessRunResult =>
    finalize(
      { ...baseOutcome('failed', [`failureCode=${failure.failureCode}`]), failure },
      { failure },
    );

  const quarantineOutcome = (
    failure: SourceFetchFailure,
    payload?: RawSourcePayloadEnvelope,
  ): SourceReadinessRunResult => {
    const quarantine = buildSourceQuarantineRecord({ failure, payloadId: payload?.payloadId });
    return finalize(
      { ...baseOutcome('quarantined', [`failureCode=${failure.failureCode}`]), failure, payload },
      { failure, quarantine, payload },
    );
  };

  switch (result.kind) {
    case 'success': {
      const payloadText = result.payloadText ?? '';
      const byteLength = result.byteLength ?? payloadText.length;
      const contentType = result.contentType ?? 'application/octet-stream';

      if (payloadText.length === 0) {
        return failOutcome(
          makeFailure(
            'empty_payload',
            sourceId,
            runId,
            observedAt,
            false,
            false,
            'success but empty payload',
          ),
        );
      }
      if (!request.acceptedContentTypes.includes(contentType)) {
        const failure = makeFailure(
          'unsupported_content_type',
          sourceId,
          runId,
          observedAt,
          false,
          true,
          `content type ${contentType} not in accepted list`,
        );
        return quarantineOutcome(failure, {
          payloadId: `pay-${runId}-${sourceId}`,
          runId,
          sourceId,
          observedAt,
          contentType,
          byteLength,
          payloadHash: deterministicHash(payloadText),
          sourceReadinessRuleVersion: SOURCE_READINESS_RULE_VERSION,
          fetchContractVersion: FETCH_CONTRACT_VERSION,
          status: 'rejected',
          quarantineReason: 'unsupported_content_type',
        });
      }
      if (byteLength > request.maxPayloadBytes) {
        const failure = makeFailure(
          'payload_too_large',
          sourceId,
          runId,
          observedAt,
          false,
          true,
          `byteLength ${byteLength} exceeds cap ${request.maxPayloadBytes}`,
        );

        return quarantineOutcome(failure, {
          payloadId: `pay-${runId}-${sourceId}`,
          runId,
          sourceId,
          observedAt,
          contentType,
          byteLength,
          payloadHash: deterministicHash(payloadText),
          sourceReadinessRuleVersion: SOURCE_READINESS_RULE_VERSION,
          fetchContractVersion: FETCH_CONTRACT_VERSION,
          status: 'rejected',
          quarantineReason: 'payload_too_large',
        });
      }
      const payload: RawSourcePayloadEnvelope = {
        payloadId: `pay-${runId}-${sourceId}`,
        runId,
        sourceId,
        observedAt,
        contentType,
        byteLength,
        payloadHash: deterministicHash(payloadText),
        payloadText,
        sourceReadinessRuleVersion: SOURCE_READINESS_RULE_VERSION,
        fetchContractVersion: FETCH_CONTRACT_VERSION,
        status: 'recorded',
      };
      return finalize(
        { ...baseOutcome('fetched', [`byteLength=${byteLength}`]), payload },
        { payload },
      );
    }

    case 'timeout':
      return failOutcome(
        makeFailure(
          'network_timeout',
          sourceId,
          runId,
          observedAt,
          true,
          false,
          'simulated timeout',
        ),
      );

    case 'unavailable':
      return failOutcome(
        makeFailure(
          'transport_unavailable',
          sourceId,
          runId,
          observedAt,
          true,
          false,
          'transport unavailable (offline/no recording)',
        ),
      );

    case 'http_error': {
      const status = result.httpStatus ?? 0;
      const retryable = status >= 500;
      return failOutcome(
        makeFailure(
          'http_status_failure',
          sourceId,
          runId,
          observedAt,
          retryable,
          false,
          `http status ${status}`,
        ),
      );
    }

    case 'empty':
      return failOutcome(
        makeFailure('empty_payload', sourceId, runId, observedAt, false, false, 'empty payload'),
      );

    case 'unsupported_content_type': {
      const contentType = result.contentType ?? 'unknown';
      const failure = makeFailure(
        'unsupported_content_type',
        sourceId,
        runId,
        observedAt,
        false,
        true,
        `unsupported content type ${contentType}`,
      );
      return quarantineOutcome(failure, {
        payloadId: `pay-${runId}-${sourceId}`,
        runId,
        sourceId,
        observedAt,
        contentType,
        byteLength: result.byteLength ?? (result.payloadText ?? '').length,
        payloadHash: deterministicHash(result.payloadText ?? ''),
        sourceReadinessRuleVersion: SOURCE_READINESS_RULE_VERSION,
        fetchContractVersion: FETCH_CONTRACT_VERSION,
        status: 'rejected',
        quarantineReason: 'unsupported_content_type',
      });
    }

    case 'oversized': {
      const failure = makeFailure(
        'payload_too_large',
        sourceId,
        runId,
        observedAt,
        false,
        true,
        'payload too large',
      );
      return quarantineOutcome(failure, {
        payloadId: `pay-${runId}-${sourceId}`,
        runId,
        sourceId,
        observedAt,
        contentType: result.contentType ?? 'application/octet-stream',
        byteLength: result.byteLength ?? request.maxPayloadBytes + 1,
        payloadHash: deterministicHash(result.payloadText ?? ''),
        sourceReadinessRuleVersion: SOURCE_READINESS_RULE_VERSION,
        fetchContractVersion: FETCH_CONTRACT_VERSION,
        status: 'rejected',
        quarantineReason: 'payload_too_large',
      });
    }

    case 'malformed': {
      const payloadText = result.payloadText ?? '';
      const failure = makeFailure(
        'malformed_payload',
        sourceId,
        runId,
        observedAt,
        false,
        true,
        'malformed payload',
      );

      return quarantineOutcome(failure, {
        payloadId: `pay-${runId}-${sourceId}`,
        runId,
        sourceId,
        observedAt,
        contentType: result.contentType ?? 'application/octet-stream',
        byteLength: result.byteLength ?? payloadText.length,
        payloadHash: deterministicHash(payloadText),
        payloadText,
        sourceReadinessRuleVersion: SOURCE_READINESS_RULE_VERSION,
        fetchContractVersion: FETCH_CONTRACT_VERSION,
        status: 'quarantined',
        quarantineReason: 'malformed_payload',
      });
    }

    default:
      return failOutcome(
        makeFailure(
          'unknown_failure',
          sourceId,
          runId,
          observedAt,
          false,
          false,
          'unknown transport result',
        ),
      );
  }
};
