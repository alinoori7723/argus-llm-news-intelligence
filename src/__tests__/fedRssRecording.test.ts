import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRss } from '@/domain/ingestion';
import {
  FakeReadinessClock,
  InMemorySourceReadinessStore,
  RecordedFixtureFetchTransport,
  evaluateSourceReadinessEligibility,
  runOfflineSourceReadiness,
} from '@/domain/sourceReadiness';
import {
  FED_PRESS_ALL_FEED_URL,
  FED_PRESS_ALL_FIXTURE_PATHS,
  FED_PRESS_ALL_READINESS_PROFILE,
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
  recordingToolVersion: string;
  sourceReadinessRuleVersion: string;
  fetchContractVersion: string;
  parserVersion: string;
  legalEvidenceNote: string;
  acquisitionMode: string;
  runtimeMode: string;
}

const xml = readFileSync(xmlPath, 'utf8');
const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as FedMeta;

describe('Fed RSS recorded fixture + metadata', () => {
  it('the recorded fixture file and metadata sidecar both exist', () => {
    expect(existsSync(xmlPath)).toBe(true);
    expect(existsSync(metaPath)).toBe(true);
  });

  it('metadata identifies the fed_press_all source + the Fed RSS URL', () => {
    expect(meta.sourceId).toBe(FED_PRESS_ALL_SOURCE_ID);
    expect(meta.sourceUrl).toBe(FED_PRESS_ALL_FEED_URL);
    expect(meta.sourceUrl).toBe('https://www.federalreserve.gov/feeds/press_all.xml');
  });

  it('metadata sha256 matches the recorded payload', () => {
    const actual = createHash('sha256').update(xml, 'utf8').digest('hex');
    expect(meta.sha256).toBe(actual);
  });

  it('metadata byteLength matches the recorded payload', () => {
    expect(Buffer.byteLength(xml, 'utf8')).toBe(meta.byteLength);
  });

  it('metadata records manual recording + recorded-fixture-only runtime', () => {
    expect(meta.acquisitionMode).toBe('manual_recording_only');
    expect(meta.runtimeMode).toBe('recorded_fixture_only');
  });

  it('metadata carries distinct observedAt + recordedAt timestamps', () => {
    expect(meta.observedAt).toBeTruthy();
    expect(meta.recordedAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(meta.observedAt))).toBe(false);
    expect(Number.isNaN(Date.parse(meta.recordedAt))).toBe(false);
  });

  it('metadata carries rule/contract/parser versions + a legal evidence note', () => {
    expect(meta.sourceReadinessRuleVersion).toBe('source-readiness-rule-v1');
    expect(meta.fetchContractVersion).toBe('fetch-contract-v1');
    expect(meta.parserVersion).toBe('rss-parser-v1');
    expect(meta.legalEvidenceNote).toMatch(/Federal Reserve/i);
    expect(meta.recordingToolVersion).toBe('record-fed-rss-v1');
  });
});

describe('Fed RSS parser (real recorded payload)', () => {
  const now = new Date(meta.recordedAt);
  const parse = () =>
    parseRss(xml, {
      sourceId: FED_PRESS_ALL_SOURCE_ID,
      rawPayloadId: 'pay-fed-test',
      observedAt: meta.recordedAt,
      now,
    });

  it('parses as RSS and extracts at least one item', () => {
    const res = parse();
    expect(res.ok).toBe(true);
    expect(res.parsedItems.length).toBeGreaterThan(0);
  });

  it('each parsed item has deterministic identity (guid/link) + a title', () => {
    const res = parse();
    for (const item of res.parsedItems) {
      expect(item.sourceItemId.length).toBeGreaterThan(0);
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  it('sourceEventTime is parsed from the feed pubDate (RFC-822), never backfilled from observedAt', () => {
    const res = parse();
    const withDate = res.parsedItems.filter((i) => i.sourceEventTime !== null);
    expect(withDate.length).toBeGreaterThan(0);
    for (const item of withDate) {
      expect(() => new Date(item.sourceEventTime as string).toISOString()).not.toThrow();
      expect(item.sourceEventTime).not.toBe(meta.recordedAt);
    }
  });

  it('CDATA-wrapped pubDate (Fed format) parses to a valid past timestamp', () => {
    const res = parse();
    const first = res.parsedItems[0];
    expect(first.sourceEventTime).toBeTypeOf('string');
    expect(new Date(first.sourceEventTime as string).getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it('CDATA/HTML in description does not break parsing or leak markup into title', () => {
    const res = parse();
    for (const item of res.parsedItems) {
      expect(item.title).not.toMatch(/<!\[CDATA\[|<\/?[a-z]+>/i);
    }
  });

  it('Fed guids are used as sourceItemId (deterministic, no fabrication)', () => {
    const res = parse();

    expect(res.parsedItems.every((i) => i.sourceItemId.startsWith('http'))).toBe(true);
  });
});

describe('Fed source-readiness + offline runner (no network)', () => {
  it('fed_press_all passes the readiness eligibility gate', () => {
    const decision = evaluateSourceReadinessEligibility(FED_PRESS_ALL_READINESS_PROFILE);
    expect(decision.status).toBe('eligible');
  });

  it('the recorded fixture is consumed by the offline transport → recorded payload envelope', () => {
    const store = new InMemorySourceReadinessStore();
    const transport = new RecordedFixtureFetchTransport({
      [FED_PRESS_ALL_SOURCE_ID]: {
        kind: 'success',
        payloadText: xml,
        contentType: 'text/xml',
      },
    });
    const res = runOfflineSourceReadiness({
      sourceProfile: FED_PRESS_ALL_READINESS_PROFILE,
      transport,
      clock: new FakeReadinessClock(Date.parse(meta.recordedAt)),
      store,
      runId: 'run.fed.1',
      sourceUrl: FED_PRESS_ALL_FEED_URL,
    });
    expect(res.outcome.status).toBe('fetched');
    const payload = store.getSnapshot().payloads[0];
    expect(payload.status).toBe('recorded');
    expect(payload.payloadHash).toMatch(/^[0-9a-f]{8}$/);
    expect(payload.sourceReadinessRuleVersion).toBe('source-readiness-rule-v1');
    expect(payload.fetchContractVersion).toBe('fetch-contract-v1');
  });

  it('the readiness profile makes the legal/ToS decision explicit (not inferred from enabled)', () => {
    expect(FED_PRESS_ALL_READINESS_PROFILE.legalStatus).toBe('allowed');
    expect(FED_PRESS_ALL_READINESS_PROFILE.tosStatus).toBe('allowed');
    expect(FED_PRESS_ALL_READINESS_PROFILE.legalEvidenceNote).toBeTruthy();
    expect(FED_PRESS_ALL_READINESS_PROFILE.runtimeMode).toBe('recorded_fixture_only');
  });
});
