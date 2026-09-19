import { describe, expect, it } from 'vitest';
import sample from '../samples/news-dataset.json';
import { ingestDataset } from './ingest';
import { sha256 } from './hash';

describe('deterministic dataset ingestion', () => {
  it('is invariant to source and article input order', () => {
    const reversed = {
      ...sample,
      sources: [...sample.sources].reverse(),
      articles: [...sample.articles].reverse(),
    };
    expect(ingestDataset(reversed)).toEqual(ingestDataset(sample));
  });
  it('quarantines blocked sources before raw persistence', () => {
    const run = ingestDataset(sample);
    expect(run.counts).toEqual({
      input: 12,
      ingested: 10,
      quarantined: 2,
      duplicates: 5,
      clusters: 5,
    });
    expect(run.rawPayloads.map((payload) => payload.sourceId)).not.toContain('community');
    expect(run.rawPayloads.map((payload) => payload.sourceId)).not.toContain('disabled-feed');
    expect(run.quarantined.map((item) => item.reason)).toEqual([
      'legal_status_needs_review',
      'legal_status_disabled',
    ]);
  });
  it('preserves unknown source time and withholds it from generation', () => {
    const run = ingestDataset(sample);
    const item = run.items.find((item) => item.id === 'undated-brief')!;
    expect(item.sourceEventTime).toBeNull();
    expect(item.observedAt).toBe(new Date(sample.observedAt).toISOString());
    expect(run.clusters.find((cluster) => cluster.itemIds.includes(item.itemId))!.eligible).toBe(
      false,
    );
  });
  it('treats future source time as uncertain', () => {
    const input = structuredClone(sample);
    input.articles[0].publishedAt = '2030-01-01T00:00:00Z';
    const run = ingestDataset(input);
    expect(run.items[0].sourceEventTime).toBeNull();
    expect(run.clusters[0].eligible).toBe(false);
  });
  it('keeps verifiable raw and normalized lineage for every item', () => {
    const run = ingestDataset(sample);
    for (const item of run.items) {
      const raw = run.rawPayloads.find((raw) => raw.id === item.rawPayloadId)!;
      expect(sha256(raw.text)).toBe(item.rawPayloadHash);
      expect(item.parserVersion).toBe('rss-parser-v1');
      expect(item.processingVersion).toBe('ingest-normalize-v1');
      expect(item.contentHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });
  it('forms one connected component for syndicated copies', () => {
    const run = ingestDataset(sample);
    const cluster = run.clusters.find((cluster) => cluster.category === 'Monetary policy')!;
    expect(cluster.itemIds).toHaveLength(3);
    expect(cluster.sourceIds).toHaveLength(2);
    expect(
      run.decisions.every((decision) =>
        ['canonical_url_exact', 'dedupe_hash_exact'].includes(decision.rule),
      ),
    ).toBe(true);
  });
  it('does not merge similar but different events', () => {
    const input = structuredClone(sample);
    input.articles.push({
      ...input.articles[0],
      id: 'policy-other',
      url: 'https://northbank.example/releases/other',
      text: 'A different announcement with different evidence.',
      title: 'A separate policy announcement',
    });
    expect(ingestDataset(input).counts.clusters).toBe(6);
  });
  it('rejects duplicate identities and undeclared sources', () => {
    expect(() =>
      ingestDataset({ ...sample, articles: [...sample.articles, sample.articles[0]] }),
    ).toThrow('Duplicate article identity');
    expect(() =>
      ingestDataset({ ...sample, articles: [{ ...sample.articles[0], sourceId: 'unknown' }] }),
    ).toThrow('Unknown source');
    expect(() =>
      ingestDataset({ ...sample, sources: [...sample.sources, sample.sources[0]] }),
    ).toThrow('Duplicate source');
  });
  it('rejects unsafe URL schemes and unexpected input fields', () => {
    expect(() =>
      ingestDataset({
        ...sample,
        articles: [{ ...sample.articles[0], url: 'javascript:alert(1)' }],
      }),
    ).toThrow();
    expect(() => ingestDataset({ ...sample, secret: 'unexpected' })).toThrow();
  });
  it('does not allow source text to inject new RSS items', () => {
    const input = structuredClone(sample);
    input.articles[0].text =
      '</description></item><item><guid>injected</guid><title>Injected</title><description>text';
    const run = ingestDataset(input);
    expect(run.items).toHaveLength(10);
    expect(run.items.some((item) => item.id === 'injected')).toBe(false);
  });
});
