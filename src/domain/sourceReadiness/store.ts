import {
  SOURCE_READINESS_RULE_VERSION,
  type RawSourcePayloadEnvelope,
  type SourceFetchFailure,
  type SourceQuarantineRecord,
  type SourceReadinessDecision,
  type SourceReadinessRunRecord,
  type SourceReadinessSnapshot,
  type SourceReadinessStore,
  type SourceRetryPlan,
} from './types';

export class InMemorySourceReadinessStore implements SourceReadinessStore {
  private readonly runs: SourceReadinessRunRecord[] = [];
  private readonly decisions: SourceReadinessDecision[] = [];
  private readonly payloads: RawSourcePayloadEnvelope[] = [];
  private readonly failures: SourceFetchFailure[] = [];
  private readonly quarantines: SourceQuarantineRecord[] = [];
  private readonly retryPlans: SourceRetryPlan[] = [];

  appendRun(record: SourceReadinessRunRecord): void {
    this.runs.push({ ...record });
  }
  appendDecision(record: SourceReadinessDecision): void {
    this.decisions.push({ ...record, deterministicInputs: [...record.deterministicInputs] });
  }
  appendPayload(record: RawSourcePayloadEnvelope): void {
    this.payloads.push({ ...record });
  }
  appendFailure(record: SourceFetchFailure): void {
    this.failures.push({ ...record });
  }
  appendQuarantine(record: SourceQuarantineRecord): void {
    this.quarantines.push({ ...record, deterministicInputs: [...record.deterministicInputs] });
  }
  appendRetryPlan(record: SourceRetryPlan): void {
    this.retryPlans.push({ ...record });
  }

  getSnapshot(): SourceReadinessSnapshot {
    return {
      runs: this.runs.map((r) => ({ ...r })),
      decisions: this.decisions.map((r) => ({
        ...r,
        deterministicInputs: [...r.deterministicInputs],
      })),
      payloads: this.payloads.map((r) => ({ ...r })),
      failures: this.failures.map((r) => ({ ...r })),
      quarantines: this.quarantines.map((r) => ({
        ...r,
        deterministicInputs: [...r.deterministicInputs],
      })),
      retryPlans: this.retryPlans.map((r) => ({ ...r })),
      ruleVersion: SOURCE_READINESS_RULE_VERSION,
    };
  }

  get runCount(): number {
    return this.runs.length;
  }
  get decisionCount(): number {
    return this.decisions.length;
  }
  get payloadCount(): number {
    return this.payloads.length;
  }
  get failureCount(): number {
    return this.failures.length;
  }
  get quarantineCount(): number {
    return this.quarantines.length;
  }
  get retryPlanCount(): number {
    return this.retryPlans.length;
  }
}
