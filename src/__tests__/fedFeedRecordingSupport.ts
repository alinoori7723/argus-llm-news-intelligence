import { expect, describe, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeParsedItems, parseRss } from '@/domain/ingestion';
import {
  FakeReadinessClock,
  InMemorySourceReadinessStore,
  RecordedFixtureFetchTransport,
  evaluateSourceReadinessEligibility,
  runOfflineSourceReadiness,
} from '@/domain/sourceReadiness';
import type { FedFeedDescriptor } from '@/fixtures/recordedSources/fed/fedMultiFeedProfiles';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export interface FedFixtureMeta {
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

const isoOk = (s: string): boolean => typeof s === 'string' && !Number.isNaN(Date.parse(s));

export const loadRecordedFeed = (
  feed: FedFeedDescriptor,
): { xml: string; meta: FedFixtureMeta; xmlPath: string; metaPath: string } => {
  const xmlPath = resolve(repoRoot, feed.fixturePaths.xml);
  const metaPath = resolve(repoRoot, feed.fixturePaths.meta);
  const xml = readFileSync(xmlPath, 'utf8');
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as FedFixtureMeta;
  return { xml, meta, xmlPath, metaPath };
};

export const parseAndNormalizeFeed = (feed: FedFeedDescriptor) => {
  const { xml, meta } = loadRecordedFeed(feed);
  const parsed = parseRss(xml, {
    sourceId: feed.sourceId,
    rawPayloadId: `pay-${feed.sourceId}`,
    observedAt: meta.observedAt,
    now: new Date(meta.recordedAt),
  });
  const normalized = normalizeParsedItems(parsed.parsedItems, {
    source: feed.ingestionProfile,
    observedAt: meta.observedAt,
    ingestedAt: meta.recordedAt,
    normalizedAt: meta.recordedAt,
  });
  return { parsed, normalized, meta };
};

export const describeRecordedFedFeed = (feed: FedFeedDescriptor): void => {
  const { xml, meta, xmlPath, metaPath } = loadRecordedFeed(feed);

  describe(`recorded Fed feed: ${feed.sourceId} — integrity (offline)`, () => {
    it('the recorded fixture file and metadata sidecar both exist', () => {
      expect(existsSync(xmlPath)).toBe(true);
      expect(existsSync(metaPath)).toBe(true);
    });

    it('metadata sourceId + sourceUrl match the expected feed', () => {
      expect(meta.sourceId).toBe(feed.sourceId);
      expect(meta.sourceUrl).toBe(feed.feedUrl);
    });

    it('metadata sha256 matches the recorded payload', () => {
      expect(meta.sha256).toBe(createHash('sha256').update(xml, 'utf8').digest('hex'));
    });

    it('metadata byteLength matches the recorded payload', () => {
      expect(meta.byteLength).toBe(Buffer.byteLength(xml, 'utf8'));
    });

    it('metadata carries BOTH observedAt and recordedAt as valid timestamps', () => {
      expect(meta).toHaveProperty('observedAt');
      expect(meta).toHaveProperty('recordedAt');
      expect(isoOk(meta.observedAt)).toBe(true);
      expect(isoOk(meta.recordedAt)).toBe(true);
    });

    it('metadata records manual recording + recorded-fixture-only runtime', () => {
      expect(['manual_recording_only', 'manual_recording_ready']).toContain(meta.acquisitionMode);
      expect(meta.runtimeMode).toBe('recorded_fixture_only');
    });

    it('metadata carries rule/contract/parser versions + a legal evidence note', () => {
      expect(meta.sourceReadinessRuleVersion).toBe('source-readiness-rule-v1');
      expect(meta.fetchContractVersion).toBe('fetch-contract-v1');
      expect(meta.parserVersion).toBe('rss-parser-v1');
      expect(meta.legalEvidenceNote).toMatch(/Federal Reserve/i);
    });
  });

  describe(`recorded Fed feed: ${feed.sourceId} — parser (real payload, offline)`, () => {
    const parse = () =>
      parseRss(xml, {
        sourceId: feed.sourceId,
        rawPayloadId: `pay-${feed.sourceId}`,
        observedAt: meta.observedAt,
        now: new Date(meta.recordedAt),
      });

    it('parses as RSS and extracts at least one item', () => {
      const res = parse();
      expect(res.ok).toBe(true);
      expect(res.parsedItems.length).toBeGreaterThan(0);
    });

    it('each parsed item has a deterministic sourceItemId + a title', () => {
      const res = parse();
      for (const item of res.parsedItems) {
        expect(item.sourceItemId.length).toBeGreaterThan(0);
        expect(item.title.length).toBeGreaterThan(0);
      }
    });

    it('Fed RFC-822 pubDate parses; sourceEventTime is NEVER backfilled from observedAt/recordedAt', () => {
      const res = parse();
      const withDate = res.parsedItems.filter((i) => i.sourceEventTime !== null);
      expect(withDate.length).toBeGreaterThan(0);
      for (const item of withDate) {
        expect(() => new Date(item.sourceEventTime as string).toISOString()).not.toThrow();
        expect(item.sourceEventTime).not.toBe(meta.observedAt);
        expect(item.sourceEventTime).not.toBe(meta.recordedAt);

        expect(new Date(item.sourceEventTime as string).getTime()).toBeLessThanOrEqual(
          Date.parse(meta.recordedAt),
        );
      }
    });

    it('CDATA/HTML does not leak markup into parsed titles', () => {
      const res = parse();
      for (const item of res.parsedItems) {
        expect(item.title).not.toMatch(/<!\[CDATA\[|<\/?[a-z]+>/i);
      }
    });
  });

  describe(`recorded Fed feed: ${feed.sourceId} — normalization (real payload, offline)`, () => {
    const { normalized } = parseAndNormalizeFeed(feed);

    it('produces at least one normalized item', () => {
      expect(normalized.length).toBeGreaterThan(0);
    });

    it('each normalized item carries sourceId/sourceItemId/url/title/parserVersion + sourceEventTime field', () => {
      for (const n of normalized) {
        expect(n.sourceId).toBe(feed.sourceId);
        expect(n.sourceItemId.length).toBeGreaterThan(0);
        expect(n.url && n.url.length).toBeTruthy();
        expect(n.title.length).toBeGreaterThan(0);
        expect(n.parserVersion).toBe('rss-parser-v1');
        expect(['string', 'object']).toContain(typeof n.sourceEventTime);
      }
    });

    it('sourceEventTime comes from feed pubDate, never from observedAt/recordedAt', () => {
      const dated = normalized.filter((n) => n.sourceEventTime !== null);
      expect(dated.length).toBeGreaterThan(0);
      for (const n of dated) {
        expect(n.sourceEventTime).not.toBe(meta.observedAt);
        expect(n.sourceEventTime).not.toBe(meta.recordedAt);
        expect(n.sourceEventTime).not.toBe(n.observedAt);
        expect(n.sourceEventTimeStatus).toBe('known');
      }
    });

    it('normalized itemId is deterministic from sourceId + sourceItemId', () => {
      const first = normalized[0];
      expect(first.itemId).toBe(`${feed.sourceId}::${first.sourceItemId}`);
    });
  });

  describe(`recorded Fed feed: ${feed.sourceId} — readiness gate + offline runner (no network)`, () => {
    it('passes the readiness eligibility gate', () => {
      const decision = evaluateSourceReadinessEligibility(feed.readinessProfile);
      expect(decision.status).toBe('eligible');
    });

    it('the recorded fixture replays through the offline transport → recorded envelope', () => {
      const store = new InMemorySourceReadinessStore();
      const transport = new RecordedFixtureFetchTransport({
        [feed.sourceId]: { kind: 'success', payloadText: xml, contentType: 'text/xml' },
      });
      const res = runOfflineSourceReadiness({
        sourceProfile: feed.readinessProfile,
        transport,
        clock: new FakeReadinessClock(Date.parse(meta.recordedAt)),
        store,
        runId: `run.${feed.sourceId}.1`,
        sourceUrl: feed.feedUrl,
      });
      expect(res.outcome.status).toBe('fetched');
      const payload = store.getSnapshot().payloads[0];
      expect(payload.status).toBe('recorded');
      expect(payload.sourceReadinessRuleVersion).toBe('source-readiness-rule-v1');
      expect(payload.fetchContractVersion).toBe('fetch-contract-v1');
    });

    it('the readiness profile makes the legal/ToS decision explicit (not inferred from enabled)', () => {
      expect(feed.readinessProfile.legalStatus).toBe('allowed');
      expect(feed.readinessProfile.tosStatus).toBe('allowed');
      expect(feed.readinessProfile.legalEvidenceNote).toBeTruthy();
      expect(feed.readinessProfile.runtimeMode).toBe('recorded_fixture_only');
    });
  });
};
