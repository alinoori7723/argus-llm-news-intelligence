import { describe, expect, it, vi } from 'vitest';
import sample from '../../samples/news-dataset.json';
import { OpenAIProvider } from './openai';
import { FixtureProvider } from './fixture';
import { ingestDataset } from '../ingest';
import { OUTPUT_SCHEMA, PROMPT_TEXT } from '../prompt';
import { DEFAULT_MODEL, estimateCost, RequestBudget } from '../pricing';

const snapshot = ingestDataset(sample);
const cluster = snapshot.clusters[0];
const input = {
  snapshotId: snapshot.id,
  cluster,
  items: snapshot.items.filter((item) => cluster.itemIds.includes(item.itemId)),
  schema: OUTPUT_SCHEMA,
  instructions: PROMPT_TEXT,
  maxOutputTokens: 1200,
};
const output = (await new FixtureProvider().generate(input)).output;
const envelope = (overrides: Record<string, unknown> = {}) => ({
  id: 'resp_test',
  model: DEFAULT_MODEL,
  status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }],
  usage: { input_tokens: 100, output_tokens: 30, input_tokens_details: { cached_tokens: 20 } },
  ...overrides,
});
const success = (overrides: Record<string, unknown> = {}) =>
  new Response(JSON.stringify(envelope(overrides)), {
    status: 200,
    headers: { 'x-request-id': 'request-123' },
  });

describe('OpenAI Responses transport', () => {
  it('sends versioned structured output instructions without persisting the API key', async () => {
    const transport = vi.fn(async (_url: string, _init: RequestInit) => success());
    const provider = new OpenAIProvider('test-only-secret', { transport });
    const result = await provider.generate(input);
    const [url, request] = transport.mock.calls[0];
    const body = JSON.parse(request.body as string);
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(body.store).toBe(false);
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(body.text.format.strict).toBe(true);
    expect(body.instructions).toContain('untrusted data');
    expect(body.input[0].content[0].text).toContain(input.items[0].itemId);
    expect(result.output).toEqual(output);
    expect(result.attempts[0].usage).toEqual({ input: 100, cachedInput: 20, output: 30 });
    expect(result.attempts[0].requestId).toBe('request-123');
    expect(JSON.stringify(result)).not.toContain('test-only-secret');
  });
  it('retries rate limits with bounded attempts and records failed requests', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 429 }))
      .mockResolvedValueOnce(success());
    const sleep = vi.fn(async () => undefined);
    const result = await new OpenAIProvider('test', { transport, sleep }).generate(input);
    expect(result.attempts.map((attempt) => attempt.status)).toEqual(['http_error', 'completed']);
    expect(sleep).toHaveBeenCalledWith(250);
    expect(result.failure).toBeNull();
  });
  it('stops after three server failures', async () => {
    const transport = vi.fn(async () => new Response('unavailable', { status: 503 }));
    const result = await new OpenAIProvider('test', {
      transport,
      sleep: async () => undefined,
    }).generate(input);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(result.failure).toBe('provider_http_503');
  });
  it('does not retry authorization failures or retain reflected secrets', async () => {
    const transport = vi.fn(async () => new Response('test-only-secret', { status: 401 }));
    const result = await new OpenAIProvider('test-only-secret', { transport }).generate(input);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(result.failure).toBe('provider_http_401');
    expect(JSON.stringify(result)).not.toContain('test-only-secret');
  });
  it.each(['TimeoutError', 'AbortError'])(
    'records %s without a synthetic fallback',
    async (name) => {
      const transport = vi.fn(async () => {
        const error = new Error('timeout');
        error.name = name;
        throw error;
      });
      const result = await new OpenAIProvider('test', { transport }).generate(input);
      expect(result.failure).toBe('provider_timeout');
      expect(result.output).toBeNull();
      expect(result.attempts).toHaveLength(1);
    },
  );
  it('records network failures without exposing raw exception text', async () => {
    const result = await new OpenAIProvider('test', {
      transport: async () => {
        throw new Error('private detail');
      },
    }).generate(input);
    expect(result.failure).toBe('provider_network_error');
    expect(JSON.stringify(result)).not.toContain('private detail');
  });
  it('handles refusals', async () => {
    const result = await new OpenAIProvider('test', {
      transport: async () =>
        success({
          output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Declined' }] }],
        }),
    }).generate(input);
    expect(result.failure).toBe('provider_refused');
    expect(result.attempts[0].usage).not.toBeNull();
  });
  it('rejects incomplete output even when its partial JSON is valid', async () => {
    const result = await new OpenAIProvider('test', {
      transport: async () => success({ status: 'incomplete' }),
    }).generate(input);
    expect(result.failure).toBe('provider_incomplete');
    expect(result.output).toBeNull();
  });
  it('retains malformed model JSON for audit without accepting it', async () => {
    const result = await new OpenAIProvider('test', {
      transport: async () =>
        success({
          output: [{ type: 'message', content: [{ type: 'output_text', text: '{broken' }] }],
        }),
    }).generate(input);
    expect(result.failure).toBe('invalid_output_json');
    expect(result.output).toBe('{broken');
  });
  it('rejects malformed provider envelopes', async () => {
    const result = await new OpenAIProvider('test', {
      transport: async () => new Response('{}'),
    }).generate(input);
    expect(result.failure).toBe('invalid_provider_envelope');
  });
  it('records a timeout while reading the body without retrying an ambiguous request', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new DOMException('expired', 'TimeoutError'));
        },
      }),
    );
    const transport = vi.fn(async () => response);
    const result = await new OpenAIProvider('test', { transport }).generate(input);
    expect(result.failure).toBe('provider_timeout');
    expect(result.attempts[0].status).toBe('timeout');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('keeps missing or inconsistent usage unknown', async () => {
    for (const usage of [
      undefined,
      { input_tokens: 2, output_tokens: 1, input_tokens_details: { cached_tokens: 3 } },
    ]) {
      const result = await new OpenAIProvider('test', {
        transport: async () => success({ usage }),
      }).generate(input);
      expect(result.attempts[0].usage).toBeNull();
    }
  });
  it('enforces the request budget before making a paid call', async () => {
    const transport = vi.fn(async () => success());
    const result = await new OpenAIProvider('test', {
      transport,
      budget: new RequestBudget(0.000001),
    }).generate(input);
    expect(transport).not.toHaveBeenCalled();
    expect(result.failure).toBe('budget_exceeded_or_unpriced_model');
  });
  it('rejects missing credentials and invalid budgets', () => {
    expect(() => new OpenAIProvider('')).toThrow('OPENAI_API_KEY');
    for (const budget of [0, -1, Infinity, NaN, 11])
      expect(() => new RequestBudget(budget)).toThrow();
  });
  it('accounts for cached input separately and never guesses prices for unknown models', () => {
    expect(
      estimateCost(DEFAULT_MODEL, { input: 1_000_000, cachedInput: 500_000, output: 100_000 }),
    ).toBe(0.41);
    expect(estimateCost('unknown', { input: 100, cachedInput: 0, output: 10 })).toBeNull();
    expect(estimateCost(DEFAULT_MODEL, null)).toBeNull();
  });
});
