import {
  SOURCE_READINESS_RULE_VERSION,
  type RetryPolicy,
  type SourceFetchFailure,
  type SourceRetryPlan,
} from './types';
import { isoFromMs, type ReadinessClock } from './clock';

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  retryPolicyId: 'retry-policy-default-v1',
  maxAttempts: 3,
  baseDelayMs: 1_000,
  backoffFactor: 2,
  maxDelayMs: 30_000,

  retryableFailureCodes: [
    'network_timeout',
    'network_unavailable_simulated',
    'http_status_failure',
    'transport_unavailable',
  ],
};

export interface PlanSourceRetryInput {
  failure: SourceFetchFailure;
  attempt: number;
  retryPolicy: RetryPolicy;
  clock: ReadinessClock;
}

export const planSourceRetry = ({
  failure,
  attempt,
  retryPolicy,
  clock,
}: PlanSourceRetryInput): SourceRetryPlan => {
  const base = {
    sourceId: failure.sourceId,
    runId: failure.runId,
    failureCode: failure.failureCode,
    attempt,
    ruleVersion: SOURCE_READINESS_RULE_VERSION,
  };

  if (!failure.retryable) {
    return { ...base, shouldRetry: false, reason: 'failure_not_retryable' };
  }
  if (!retryPolicy.retryableFailureCodes.includes(failure.failureCode)) {
    return { ...base, shouldRetry: false, reason: 'failure_code_not_in_policy' };
  }
  if (attempt >= retryPolicy.maxAttempts) {
    return { ...base, shouldRetry: false, reason: 'max_attempts_reached' };
  }

  const raw = retryPolicy.baseDelayMs * retryPolicy.backoffFactor ** (attempt - 1);
  const delayMs = Math.min(retryPolicy.maxDelayMs, raw);
  return {
    ...base,
    shouldRetry: true,
    delayMs,
    nextAttemptAt: isoFromMs(clock.now() + delayMs),
    reason: 'scheduled_backoff',
  };
};
