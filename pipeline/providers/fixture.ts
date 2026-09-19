import type { GenerationInput, ProviderResult, SummaryProvider } from '../contracts';

export class FixtureProvider implements SummaryProvider {
  readonly name = 'fixture' as const;
  readonly model = 'extractive-fixture-v1';
  async generate(input: GenerationInput): Promise<ProviderResult> {
    const item = input.items[0];
    const sentences = item.text
      .split(/(?<=[.!?])\s+(?=[A-Z])/u)
      .map((part) => part.trim())
      .filter(Boolean);
    return {
      output: {
        schemaVersion: 'summary-v1',
        headline: item.title,
        claims: sentences
          .slice(0, 2)
          .map((text) => ({ text, evidence: [{ itemId: item.itemId, quote: text }] })),
        uncertainty: [
          'Synthetic sample data. This extractive fixture is not a live model response.',
        ],
      },
      model: this.model,
      responseId: null,
      attempts: [],
      failure: null,
    };
  }
}
