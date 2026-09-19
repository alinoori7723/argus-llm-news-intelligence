import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeParsedItems, parseRss } from '@/domain/ingestion';
import type { SourceProfile } from '@/domain/types';
import {
  FED_PRESS_ALL_FIXTURE_PATHS,
  FED_PRESS_ALL_SOURCE_ID,
} from '@/fixtures/recordedSources/fed/fedSourceProfile';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const xmlPath = resolve(repoRoot, FED_PRESS_ALL_FIXTURE_PATHS.xml);
const metaPath = resolve(repoRoot, FED_PRESS_ALL_FIXTURE_PATHS.meta);

interface FedMeta {
  sourceId: string;
  sourceUrl: string;
  observedAt: string;
  recordedAt: string;
  contentType: string;
  byteLength: number;
  sha256: string;
  parserVersion: string;
  acquisitionMode: string;
  runtimeMode: string;
}

const xml = readFileSync(xmlPath, 'utf8');
const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as FedMeta;
const isoOk = (s: string) => !Number.isNaN(Date.parse(s));

const fedSourceProfile: SourceProfile = {
  sourceId: FED_PRESS_ALL_SOURCE_ID,
  name: 'Federal Reserve Board — All Press Releases RSS',
  sourceType: 'rss_fixture',
  accessMethod: 'recorded_fixture',
  legalStatus: 'allowed',
  enabled: true,
  sourceTier: 'primary',
  trustNotes: 'Official Federal Reserve press releases (recorded fixture).',
  freshnessExpectation: 'irregular',
  defaultAssetTags: [],
  defaultTopicTags: [],
};

describe('recorded Fed RSS fixture — integrity (offline)', () => {
  it('the recorded fixture file and metadata sidecar exist', () => {
    expect(existsSync(xmlPath)).toBe(true);
    expect(existsSync(metaPath)).toBe(true);
  });

  it('metadata sourceId is fed_press_all', () => {
    expect(meta.sourceId).toBe('fed_press_all');
  });

  it('metadata sha256 matches the recorded fixture content', () => {
    expect(meta.sha256).toBe(createHash('sha256').update(xml, 'utf8').digest('hex'));
  });

  it('metadata byteLength matches the recorded fixture content', () => {
    expect(meta.byteLength).toBe(Buffer.byteLength(xml, 'utf8'));
  });

  it('metadata carries BOTH observedAt and recordedAt as distinct, valid timestamps', () => {
    expect(meta).toHaveProperty('observedAt');
    expect(meta).toHaveProperty('recordedAt');
    expect(isoOk(meta.observedAt)).toBe(true);
    expect(isoOk(meta.recordedAt)).toBe(true);

    expect(typeof meta.observedAt).toBe('string');
    expect(typeof meta.recordedAt).toBe('string');
  });

  it('the fixture parses offline (no network in tests)', () => {
    const res = parseRss(xml, {
      sourceId: FED_PRESS_ALL_SOURCE_ID,
      rawPayloadId: 'pay-fed-recorded',
      observedAt: meta.observedAt,
      now: new Date(meta.recordedAt),
    });
    expect(res.ok).toBe(true);
    expect(res.parsedItems.length).toBeGreaterThan(0);
  });
});

describe('recorded Fed RSS — normalization (real payload, offline)', () => {
  const parsed = parseRss(xml, {
    sourceId: FED_PRESS_ALL_SOURCE_ID,
    rawPayloadId: 'pay-fed-recorded',
    observedAt: meta.observedAt,
    now: new Date(meta.recordedAt),
  });
  const normalized = normalizeParsedItems(parsed.parsedItems, {
    source: fedSourceProfile,
    observedAt: meta.observedAt,
    ingestedAt: meta.recordedAt,
    normalizedAt: meta.recordedAt,
  });

  it('produces at least one normalized item', () => {
    expect(normalized.length).toBeGreaterThan(0);
  });

  it('each normalized item carries sourceId/sourceItemId/url/title/parserVersion + sourceEventTime field', () => {
    for (const n of normalized) {
      expect(n.sourceId).toBe('fed_press_all');
      expect(n.sourceItemId.length).toBeGreaterThan(0);
      expect(n.url && n.url.length).toBeTruthy();
      expect(n.title.length).toBeGreaterThan(0);
      expect(n.parserVersion).toBe('rss-parser-v1');

      expect(['string', 'object']).toContain(typeof n.sourceEventTime);
    }
  });

  it('sourceEventTime comes from the feed pubDate (RFC-822) and is NEVER backfilled from observedAt/recordedAt', () => {
    const dated = normalized.filter((n) => n.sourceEventTime !== null);
    expect(dated.length).toBeGreaterThan(0);
    for (const n of dated) {
      expect(n.sourceEventTime).not.toBe(meta.observedAt);
      expect(n.sourceEventTime).not.toBe(meta.recordedAt);
      expect(n.sourceEventTime).not.toBe(n.observedAt);

      const t = new Date(n.sourceEventTime as string).getTime();
      expect(Number.isNaN(t)).toBe(false);
      expect(t).toBeLessThanOrEqual(Date.parse(meta.recordedAt));
      expect(n.sourceEventTimeStatus).toBe('known');
    }
  });

  it('CDATA/HTML in the Fed description does not leak markup into normalized title/excerpt', () => {
    for (const n of normalized) {
      expect(n.title).not.toMatch(/<!\[CDATA\[|<\/?[a-z]+>/i);
      if (n.excerpt) expect(n.excerpt).not.toMatch(/<!\[CDATA\[|<\/?[a-z]+>/i);
    }
  });

  it('normalized itemId is deterministic from sourceId + sourceItemId', () => {
    const first = normalized[0];
    expect(first.itemId).toBe(`fed_press_all::${first.sourceItemId}`);
  });
});
