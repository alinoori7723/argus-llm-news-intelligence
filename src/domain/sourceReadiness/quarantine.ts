import {
  SOURCE_READINESS_RULE_VERSION,
  type SourceFetchFailure,
  type SourceQuarantineRecord,
} from './types';

export interface BuildQuarantineInput {
  failure: SourceFetchFailure;
  payloadId?: string;
  reviewRequired?: boolean;
}

export const buildSourceQuarantineRecord = ({
  failure,
  payloadId,
  reviewRequired = true,
}: BuildQuarantineInput): SourceQuarantineRecord => ({
  quarantineId: `qua-${failure.runId}-${failure.sourceId}`,
  runId: failure.runId,
  sourceId: failure.sourceId,
  payloadId,
  failureCode: failure.failureCode,
  reason: failure.reason,
  observedAt: failure.observedAt,
  retryable: failure.retryable,
  reviewRequired,
  ruleVersion: SOURCE_READINESS_RULE_VERSION,
  deterministicInputs: [
    `failureCode=${failure.failureCode}`,
    `retryable=${failure.retryable}`,
    `payloadId=${payloadId ?? 'none'}`,
  ],
});
