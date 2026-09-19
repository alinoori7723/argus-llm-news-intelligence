import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { Attempt, GenerationInput, ProviderResult, SummaryProvider } from '../contracts';
import { canonicalJson } from '../hash';
import { DEFAULT_MODEL, RequestBudget } from '../pricing';

const usageSchema = z
  .object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    input_tokens_details: z.object({ cached_tokens: z.number().int().nonnegative() }),
  })
  .refine((value) => value.input_tokens_details.cached_tokens <= value.input_tokens);

const responseSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1),
  status: z.string(),
  output: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(
          z.object({
            type: z.string(),
            text: z.string().optional(),
            refusal: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ),
  usage: z.unknown().optional(),
});

export type Transport = (url: string, init: RequestInit) => Promise<Response>;
export class OpenAIProvider implements SummaryProvider {
  readonly name = 'openai' as const;
  readonly model: string;
  private readonly transport: Transport;
  private readonly sleep: (ms: number) => Promise<unknown>;
  private readonly timer: () => number;
  private readonly budget: RequestBudget;
  private readonly timeoutMs: number;
  constructor(
    private readonly apiKey: string,
    options: {
      model?: string;
      transport?: Transport;
      sleep?: (ms: number) => Promise<unknown>;
      timer?: () => number;
      budget?: RequestBudget;
      timeoutMs?: number;
    } = {},
  ) {
    if (!apiKey.trim()) throw new Error('OPENAI_API_KEY is required for the live provider.');
    this.model = options.model ?? DEFAULT_MODEL;
    this.transport = options.transport ?? fetch;
    this.sleep = options.sleep ?? delay;
    this.timer = options.timer ?? (() => performance.now());
    this.budget = options.budget ?? new RequestBudget(0.1);
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async generate(input: GenerationInput): Promise<ProviderResult> {
    const attempts: Attempt[] = [];
    const body = canonicalJson({
      model: this.model,
      instructions: input.instructions,
      store: false,
      temperature: 0,
      max_output_tokens: input.maxOutputTokens,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: canonicalJson({
                snapshotId: input.snapshotId,
                records: input.items.map((item) => ({
                  itemId: item.itemId,
                  title: item.title,
                  text: item.text,
                  sourceEventTime: item.sourceEventTime,
                })),
              }),
            },
          ],
        },
      ],
      text: {
        format: { type: 'json_schema', name: 'news_summary', strict: true, schema: input.schema },
      },
    });
    const failed = (
      failure: string,
      output: unknown = null,
      model = this.model,
      responseId: string | null = null,
    ): ProviderResult => ({ output, model, responseId, attempts, failure });
    for (let number = 1; number <= 3; number++) {
      if (!this.budget.reserve(this.model, body, input.maxOutputTokens))
        return failed('budget_exceeded_or_unpriced_model');
      const started = this.timer();
      let response: Response;
      try {
        response = await this.transport('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
          redirect: 'error',
        });
      } catch (error) {
        const timeout =
          error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
        attempts.push({
          number,
          status: timeout ? 'timeout' : 'network_error',
          latencyMs: Math.max(0, this.timer() - started),
          httpStatus: null,
          requestId: null,
          usage: null,
        });
        return failed(timeout ? 'provider_timeout' : 'provider_network_error');
      }
      const attempt: Attempt = {
        number,
        status: 'completed',
        latencyMs: 0,
        httpStatus: response.status,
        requestId: response.headers.get('x-request-id'),
        usage: null,
      };
      if (!response.ok) {
        attempt.status = 'http_error';
        attempt.latencyMs = Math.max(0, this.timer() - started);
        attempts.push(attempt);
        await response.body?.cancel();
        if ((response.status === 429 || response.status >= 500) && number < 3) {
          await this.sleep(Math.min(2000, 250 * 2 ** (number - 1)));
          continue;
        }
        return failed(`provider_http_${response.status}`);
      }
      let envelope: z.infer<typeof responseSchema>;
      try {
        const text = await response.text();
        if (text.length > 256_000) throw new Error('Response exceeds limit');
        envelope = responseSchema.parse(JSON.parse(text));
      } catch (error) {
        const timeout =
          error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
        attempt.status = timeout ? 'timeout' : 'invalid_response';
        attempt.latencyMs = Math.max(0, this.timer() - started);
        attempts.push(attempt);
        return failed(timeout ? 'provider_timeout' : 'invalid_provider_envelope');
      }
      attempt.latencyMs = Math.max(0, this.timer() - started);
      const parsedUsage = usageSchema.safeParse(envelope.usage);
      if (parsedUsage.success)
        attempt.usage = {
          input: parsedUsage.data.input_tokens,
          output: parsedUsage.data.output_tokens,
          cachedInput: parsedUsage.data.input_tokens_details.cached_tokens,
        };
      const content = envelope.output
        .filter((item) => item.type === 'message')
        .flatMap((item) => item.content ?? []);
      if (content.some((part) => part.type === 'refusal')) {
        attempt.status = 'refused';
        attempts.push(attempt);
        return failed('provider_refused', null, envelope.model, envelope.id);
      }
      if (envelope.status !== 'completed') {
        attempt.status = 'incomplete';
        attempts.push(attempt);
        return failed('provider_incomplete', null, envelope.model, envelope.id);
      }
      attempts.push(attempt);
      const outputText = content
        .filter((part) => part.type === 'output_text')
        .map((part) => part.text ?? '')
        .join('');
      try {
        return {
          output: JSON.parse(outputText),
          model: envelope.model,
          responseId: envelope.id,
          attempts,
          failure: null,
        };
      } catch {
        return failed('invalid_output_json', outputText, envelope.model, envelope.id);
      }
    }
    return failed('retry_exhausted');
  }
}
