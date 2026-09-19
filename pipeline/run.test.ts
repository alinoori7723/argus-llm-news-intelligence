import { describe, expect, it, vi } from 'vitest';
import sample from '../samples/news-dataset.json';
import { FixtureProvider } from './providers/fixture';
import { OpenAIProvider } from './providers/openai';
import { runPipeline, type RuntimeContext } from './run';
import { DEFAULT_MODEL } from './pricing';

function context(id = 'test-run'): RuntimeContext {
  let elapsed = 0;
  return { runId: id, now: () => new Date('2026-09-19T12:00:00Z'), timer: () => elapsed++ };
}

describe('runtime orchestration', () => {
  it('reproduces semantic results independently of wall clock and run identity', async () => {
    const a = await runPipeline(sample, new FixtureProvider(), context('run-a'));
    const b = await runPipeline(sample, new FixtureProvider(), {
      runId: 'run-b',
      now: () => new Date('2027-01-01T00:00:00Z'),
      timer: () => performance.now(),
    });
    expect(a.semanticHash).toBe(b.semanticHash);
    expect(a.createdAt).not.toBe(b.createdAt);
    expect(a.telemetry).toMatchObject({
      accepted: 4,
      rejected: 0,
      skipped: 1,
      providerCalls: 0,
      estimatedCostUsd: 0,
    });
    expect(
      a.generations.every((generation) => generation.telemetry.providerLatencyMs === null),
    ).toBe(true);
  });
  it('never sends an unknown-time record to the provider', async () => {
    const provider = new FixtureProvider();
    const generate = vi.spyOn(provider, 'generate');
    await runPipeline(sample, provider, context());
    expect(generate).toHaveBeenCalledTimes(4);
    for (const [input] of generate.mock.calls)
      expect(input.items.every((item) => item.sourceEventTime !== null)).toBe(true);
  });
  it('keeps rejected outputs inspectable but never promotable', async () => {
    const provider = new FixtureProvider();
    vi.spyOn(provider, 'generate').mockResolvedValue({
      output: { headline: 'invalid' },
      model: provider.model,
      responseId: null,
      attempts: [],
      failure: null,
    });
    const run = await runPipeline(sample, provider, context());
    expect(run.telemetry.rejected).toBe(4);
    expect(run.generations[0].rawOutput).toEqual({ headline: 'invalid' });
    expect(run.generations[0].output).toBeNull();
  });
  it('records adapter exceptions as rejection, without leaking error details', async () => {
    const provider = new FixtureProvider();
    vi.spyOn(provider, 'generate').mockRejectedValue(new Error('secret detail'));
    const run = await runPipeline(sample, provider, context());
    expect(run.telemetry.rejected).toBe(4);
    expect(JSON.stringify(run)).not.toContain('secret detail');
  });
  it('retains unknown cost when a paid response has no usage', async () => {
    const transport = async () =>
      new Response(
        JSON.stringify({ id: 'r', model: DEFAULT_MODEL, status: 'incomplete', output: [] }),
      );
    const run = await runPipeline(sample, new OpenAIProvider('test', { transport }), context());
    expect(run.telemetry.estimatedCostUsd).toBeNull();
    expect(run.telemetry.providerCalls).toBe(4);
    expect(run.generations[0].telemetry.costStatus).toBe('unknown');
  });
  it('exposes exact prompt and schema hashes on every generation', async () => {
    const run = await runPipeline(sample, new FixtureProvider(), context());
    for (const generation of run.generations) {
      expect(generation.prompt.sha256).toHaveLength(64);
      expect(generation.schema.sha256).toHaveLength(64);
      expect(generation.sourceItemIds.length).toBeGreaterThan(0);
      expect(generation.inputHash).toHaveLength(64);
    }
  });
});
