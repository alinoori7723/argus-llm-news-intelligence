import type { TokenUsage } from './contracts';

export const DEFAULT_MODEL = 'gpt-4.1-mini-2025-04-14';
export const PRICING_VERSION = 'openai-gpt-4.1-mini-2026-09-19';
export const PRICING_SOURCE = 'https://developers.openai.com/api/docs/models/gpt-4.1-mini';
export const rates = { input: 0.4, cachedInput: 0.1, output: 1.6 };

export function estimateCost(model: string, usage: TokenUsage | null): number | null {
  if (!usage || ![DEFAULT_MODEL, 'gpt-4.1-mini'].includes(model)) return null;
  return Number(
    (
      ((usage.input - usage.cachedInput) * rates.input +
        usage.cachedInput * rates.cachedInput +
        usage.output * rates.output) /
      1_000_000
    ).toFixed(8),
  );
}

export class RequestBudget {
  private reserved = 0;
  constructor(readonly maxUsd: number) {
    if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > 10)
      throw new Error('Budget must be greater than zero and at most $10.');
  }
  reserve(model: string, requestBody: string, outputTokens: number): boolean {
    const ceiling = estimateCost(model, {
      input: Buffer.byteLength(requestBody, 'utf8') + 4096,
      cachedInput: 0,
      output: outputTokens,
    });
    if (ceiling === null || this.reserved + ceiling > this.maxUsd) return false;
    this.reserved += ceiling;
    return true;
  }
}
