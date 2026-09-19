import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RSS_PARSER_VERSION,
  fixedClock,
  normalizeParsedItems,
  parseRss,
  type ParseRssOptions,
} from '@/domain/ingestion';
import type { SourceProfile } from '@/domain/types';

const NOW = fixedClock('2026-05-29T12:00:00.000Z').now();
const OBSERVED_AT = '2026-05-29T11:59:00.000Z';

const readFixture = (name: string) =>
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/rss', name), 'utf8');

const optsFor = (sourceId: string): ParseRssOptions => ({
  sourceId,
  rawPayloadId: `raw-${sourceId}-1`,
  observedAt: OBSERVED_AT,
  now: NOW,
});

const fakeSource = (sourceId: string): SourceProfile => ({
  sourceId,
  name: 'fixture',
  sourceType: 'rss_fixture',
  accessMethod: 'recorded-fixture-xml',
  legalStatus: 'allowed',
  enabled: true,
  sourceTier: 'reputable',
  trustNotes: '',
  freshnessExpectation: '',
  defaultAssetTags: [],
  defaultTopicTags: [],
});

describe('B. fetch/parse separation', () => {
  it('the parser parses a raw XML string with no fetcher and no network', () => {
    const result = parseRss(readFixture('clean-market-feed.xml'), optsFor('src.rss.clean'));
    expect(result.ok).toBe(true);
    expect(result.parsedItems.length).toBeGreaterThan(0);
  });
});

describe('C. clean RSS parser', () => {
  const result = parseRss(readFixture('clean-market-feed.xml'), optsFor('src.rss.clean'));

  it('parses at least 5 items', () => {
    expect(result.parsedItems.length).toBeGreaterThanOrEqual(5);
    expect(result.malformedItems).toHaveLength(0);
  });

  it('every parsed item has sourceItemId, title, and carries parserVersion', () => {
    for (const item of result.parsedItems) {
      expect(item.sourceItemId.length).toBeGreaterThan(0);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.parserVersion).toBe(RSS_PARSER_VERSION);
    }
  });

  it('preserves link/evidence where available', () => {
    for (const item of result.parsedItems) {
      expect(item.link).toMatch(/^https:\/\/example\.invalid\//);
    }
  });

  it('valid pubDate becomes sourceEventTime (ISO)', () => {
    const first = result.parsedItems.find((i) => i.sourceItemId === 'clean-fed-forum-001')!;
    expect(first.pubDateState).toBe('valid');
    expect(first.sourceEventTime).toBe('2026-05-28T09:30:00.000Z');
  });
});

describe('D. missing / invalid sourceEventTime', () => {
  it('missing pubDate ⇒ sourceEventTime null + missing_pubdate warning', () => {
    const result = parseRss(readFixture('missing-pubdate-feed.xml'), optsFor('src.rss.nopubdate'));
    expect(result.parsedItems.length).toBeGreaterThan(0);
    for (const item of result.parsedItems) {
      expect(item.sourceEventTime).toBeNull();
      expect(item.pubDateState).toBe('missing');

      expect(item.sourceEventTime).not.toBe(OBSERVED_AT);
    }
    expect(result.warnings.some((w) => w.code === 'missing_pubdate')).toBe(true);
  });

  it('invalid pubDate ⇒ sourceEventTime null + invalid_pubdate warning', () => {
    const result = parseRss(readFixture('malformed-market-feed.xml'), optsFor('src.rss.malformed'));
    const bad = result.parsedItems.find((i) => i.sourceItemId === 'malformed-badpub-003')!;
    expect(bad.pubDateState).toBe('invalid');
    expect(bad.sourceEventTime).toBeNull();
    expect(result.warnings.some((w) => w.code === 'invalid_pubdate')).toBe(true);
  });

  it('sourceEventTime is never equal to observedAt for any parsed item', () => {
    const result = parseRss(readFixture('missing-pubdate-feed.xml'), optsFor('src.rss.nopubdate'));
    for (const item of result.parsedItems) {
      expect(item.sourceEventTime).not.toBe(item.rawPayloadId);
      expect(item.sourceEventTime).not.toBe(OBSERVED_AT);
    }
  });
});

describe('F. future pubDate', () => {
  const result = parseRss(readFixture('future-pubdate-feed.xml'), optsFor('src.rss.future'));

  it('future pubDate is warned and NOT treated as normal chronology', () => {
    const future = result.parsedItems.find((i) => i.sourceItemId === 'future-ahead-001')!;
    expect(future.pubDateState).toBe('future');
    expect(future.sourceEventTime).toBeNull();

    expect(future.rawPubDate).toMatch(/2029/);
    expect(result.warnings.some((w) => w.code === 'future_pubdate')).toBe(true);
  });

  it('a normal past item in the same feed still gets a valid sourceEventTime', () => {
    const normal = result.parsedItems.find((i) => i.sourceItemId === 'future-normal-002')!;
    expect(normal.pubDateState).toBe('valid');
    expect(normal.sourceEventTime).toBe('2026-05-27T09:00:00.000Z');
  });
});

describe('G. duplicate handling', () => {
  const result = parseRss(readFixture('malformed-market-feed.xml'), optsFor('src.rss.malformed'));

  it('duplicate guid is deduped deterministically (first kept) with a warning', () => {
    const withGuid = result.parsedItems.filter((i) => i.sourceItemId === 'malformed-valid-001');
    expect(withGuid).toHaveLength(1);
    const dupWarnings = result.warnings.filter((w) => w.code === 'duplicate_guid');
    expect(dupWarnings.length).toBe(1);
    expect(dupWarnings[0].sourceItemId).toBe('malformed-valid-001');
  });
});

describe('H. sanitization', () => {
  it('HTML in title/excerpt is stripped before user-facing fields + html_sanitized warning', () => {
    const parsed = parseRss(readFixture('malformed-market-feed.xml'), optsFor('src.rss.malformed'));
    const htmlItem = parsed.parsedItems.find((i) => i.sourceItemId === 'malformed-html-006')!;
    expect(htmlItem.title).not.toMatch(/<[^>]+>/);
    expect(htmlItem.title).toContain('Bold');
    expect(htmlItem.excerpt ?? '').not.toMatch(/<[^>]+>/);
    expect(parsed.warnings.some((w) => w.code === 'html_sanitized')).toBe(true);

    const normalized = normalizeParsedItems([htmlItem], {
      source: fakeSource('src.rss.malformed'),
      observedAt: OBSERVED_AT,
      ingestedAt: OBSERVED_AT,
      normalizedAt: OBSERVED_AT,
    })[0];
    expect(normalized.title).not.toMatch(/<[^>]+>/);
    expect(normalized.excerpt ?? '').not.toMatch(/<[^>]+>/);
  });
});
