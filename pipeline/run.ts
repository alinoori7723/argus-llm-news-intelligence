import type { Generation, RunArtifact, SummaryProvider, TokenUsage } from './contracts';
import { contentHash, semanticRunHash } from './hash';
import { ingestDataset } from './ingest';
import { OUTPUT_SCHEMA, PROMPT_HASH, PROMPT_TEXT, PROMPT_VERSION, SCHEMA_HASH } from './prompt';
import { estimateCost, PRICING_VERSION } from './pricing';
import { validateSummary, VALIDATION_CHECKS, VALIDATOR_VERSION } from './validate';

export type RuntimeContext = { runId: string; now: () => Date; timer: () => number };
const round = (value: number): number => Number(Math.max(0, value).toFixed(3));

export async function runPipeline(
  input: unknown,
  provider: SummaryProvider,
  context: RuntimeContext,
): Promise<RunArtifact> {
  const started = context.timer();
  const snapshot = ingestDataset(input);
  const ingestionMs = context.timer() - started;
  const generations: Generation[] = [];
  let generationMs = 0;
  let validationMs = 0;
  for (const cluster of snapshot.clusters) {
    const items = snapshot.items.filter((item) => cluster.itemIds.includes(item.itemId));
    const inputHash = contentHash({
      snapshotId: snapshot.id,
      clusterId: cluster.id,
      items,
      prompt: PROMPT_HASH,
      schema: SCHEMA_HASH,
      model: provider.model,
    });
    const generation: Generation = {
      id: `generation-${inputHash.slice(0, 16)}`,
      clusterId: cluster.id,
      status: 'skipped',
      provider: provider.name,
      model: { requested: provider.model, returned: provider.model },
      prompt: { version: PROMPT_VERSION, sha256: PROMPT_HASH, text: PROMPT_TEXT },
      schema: { version: 'summary-v1', sha256: SCHEMA_HASH },
      inputHash,
      sourceItemIds: items.map((item) => item.itemId),
      responseId: null,
      output: null,
      rawOutput: null,
      validation: { version: VALIDATOR_VERSION, issues: [], checks: VALIDATION_CHECKS },
      telemetry: {
        attempts: [],
        providerLatencyMs: null,
        usage: null,
        estimatedCostUsd: 0,
        costStatus: 'not_applicable',
        pricingVersion: null,
      },
    };
    if (!cluster.eligible) {
      generation.validation.issues.push({
        code: 'ineligible_source_time',
        path: 'input',
        message: 'Unknown or future publication time prevents generation.',
      });
      generations.push(generation);
      continue;
    }
    const generationStart = context.timer();
    let result;
    try {
      result = await provider.generate({
        snapshotId: snapshot.id,
        cluster,
        items,
        instructions: PROMPT_TEXT,
        schema: OUTPUT_SCHEMA,
        maxOutputTokens: 1200,
      });
    } catch {
      result = {
        output: null,
        model: provider.model,
        responseId: null,
        attempts: [],
        failure: 'provider_unhandled_error',
      };
    }
    generationMs += context.timer() - generationStart;
    generation.model.returned = result.model;
    generation.responseId = result.responseId;
    generation.rawOutput = result.output;
    generation.telemetry.attempts = result.attempts.map((attempt) => ({
      ...attempt,
      latencyMs: round(attempt.latencyMs),
    }));
    if (provider.name === 'openai') {
      const completeUsage =
        result.attempts.length > 0 && result.attempts.every((attempt) => attempt.usage !== null);
      const usage: TokenUsage | null = completeUsage
        ? result.attempts.reduce(
            (total, attempt) => ({
              input: total.input + attempt.usage!.input,
              cachedInput: total.cachedInput + attempt.usage!.cachedInput,
              output: total.output + attempt.usage!.output,
            }),
            { input: 0, cachedInput: 0, output: 0 },
          )
        : null;
      const cost = estimateCost(result.model, usage);
      generation.telemetry = {
        ...generation.telemetry,
        providerLatencyMs: result.attempts.length
          ? round(result.attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0))
          : null,
        usage,
        estimatedCostUsd: cost,
        costStatus: cost === null ? 'unknown' : 'estimated',
        pricingVersion: cost === null ? null : PRICING_VERSION,
      };
    }
    const validationStart = context.timer();
    if (result.failure) {
      generation.status = 'rejected';
      generation.validation.issues = [
        {
          code: result.failure,
          path: 'provider',
          message: 'Generation was not accepted. Inspect the recorded attempt metadata.',
        },
      ];
    } else {
      const validation = validateSummary(result.output, items);
      generation.output = validation.output;
      generation.status = validation.output ? 'accepted' : 'rejected';
      generation.validation.issues = validation.issues;
    }
    validationMs += context.timer() - validationStart;
    generations.push(generation);
  }
  const semanticHash = semanticRunHash({ snapshot, generations });
  const costsKnown = generations.every(
    (generation) => generation.telemetry.estimatedCostUsd !== null,
  );
  return {
    schemaVersion: 'run-v1',
    runId: context.runId,
    semanticHash,
    createdAt: context.now().toISOString(),
    mode: provider.name,
    datasetKind: snapshot.dataset.synthetic ? 'synthetic' : 'provided',
    versions: {
      pipeline: 'intelligence-pipeline-v1',
      ingestion: 'rss-parser-v1/ingest-normalize-v1',
      dedupe: 'dedupe-rule-v1/connected-components-v1',
      prompt: PROMPT_VERSION,
      validation: VALIDATOR_VERSION,
    },
    snapshot,
    generations,
    telemetry: {
      timingKind: 'measured_local',
      stages: [
        { name: 'Ingest + cluster', durationMs: round(ingestionMs) },
        { name: 'Generate', durationMs: round(generationMs) },
        { name: 'Validate', durationMs: round(validationMs) },
      ],
      totalMs: round(context.timer() - started),
      providerCalls: generations.reduce(
        (sum, generation) => sum + generation.telemetry.attempts.length,
        0,
      ),
      accepted: generations.filter((generation) => generation.status === 'accepted').length,
      rejected: generations.filter((generation) => generation.status === 'rejected').length,
      skipped: generations.filter((generation) => generation.status === 'skipped').length,
      estimatedCostUsd: costsKnown
        ? Number(
            generations
              .reduce((sum, generation) => sum + generation.telemetry.estimatedCostUsd!, 0)
              .toFixed(8),
          )
        : null,
    },
  };
}
