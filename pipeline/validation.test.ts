import { beforeAll, describe, expect, it } from 'vitest';
import sample from '../samples/news-dataset.json';
import { FixtureProvider } from './providers/fixture';
import { ingestDataset } from './ingest';
import { OUTPUT_SCHEMA, PROMPT_TEXT } from './prompt';
import { summarySchema, type Summary } from './contracts';
import { validateSummary } from './validate';
import { validationCases } from './eval-cases';

const snapshot = ingestDataset(sample);
const cluster = snapshot.clusters[0];
const items = snapshot.items.filter((item) => cluster.itemIds.includes(item.itemId));
let summary: Summary;
beforeAll(async () => {
  summary = summarySchema.parse(
    (
      await new FixtureProvider().generate({
        snapshotId: snapshot.id,
        cluster,
        items,
        schema: OUTPUT_SCHEMA,
        instructions: PROMPT_TEXT,
        maxOutputTokens: 1200,
      })
    ).output,
  );
});

describe('summary acceptance boundary', () => {
  it('accepts grounded output and rejects every adversarial contract case', () => {
    for (const item of validationCases(summary, items)) {
      const result = validateSummary(item.candidate, items);
      expect(result.output !== null, item.name).toBe(item.expected === 'accepted');
    }
  });
  it('checks numeric support against the claim evidence, not an unrelated record', () => {
    const copy = structuredClone(summary);
    copy.claims[0].text = 'The published value was 777.';
    const extra = {
      ...items[0],
      itemId: 'irrelevant',
      text: 'An unrelated publication reported 777.',
    };
    expect(validateSummary(copy, [...items, extra]).issues.map((issue) => issue.code)).toContain(
      'unsupported_number',
    );
  });
  it('does not mutate the provider output', () => {
    const copy = structuredClone(summary);
    validateSummary(copy, items);
    expect(copy).toEqual(summary);
  });
  it('does not accept unknown evidence in an otherwise valid claim', () => {
    const copy = structuredClone(summary);
    copy.claims[0].evidence.push({ itemId: 'missing', quote: items[0].text });
    expect(validateSummary(copy, items).output).toBeNull();
  });
});
