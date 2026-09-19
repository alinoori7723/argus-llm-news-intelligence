import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeParsedItems,
  parseRss,
  type Clock,
  type NormalizedIngestedItem,
} from '@/domain/ingestion';
import type { ExternalItem, SourceProfile } from '@/domain/types';
import {
  AppendOnlyClusterStore,
  ConfirmedClusterEngine,
  canonicalizeUrl,
  confirmedClusters,
  identityIndex,
  membershipReasonFor,
  toCanonicalIdentity,
  type CanonicalIdentity,
} from '@/domain/clustering';
import {
  FED_PRESS_ALL_FIXTURE_PATHS,
  FED_PRESS_ALL_SOURCE_ID,
} from '@/fixtures/recordedSources/fed/fedSourceProfile';
import { FED_MONETARY_POLICY } from '@/fixtures/recordedSources/fed/fedMultiFeedProfiles';
import { repoRoot } from './fedFeedRecordingSupport';

const pressAllProfile: SourceProfile = {
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

const normalizeFixture = (
  xmlRel: string,
  metaRel: string,
  sourceId: string,
  profile: SourceProfile,
): NormalizedIngestedItem[] => {
  const xml = readFileSync(resolve(repoRoot, xmlRel), 'utf8');
  const meta = JSON.parse(readFileSync(resolve(repoRoot, metaRel), 'utf8')) as {
    observedAt: string;
    recordedAt: string;
  };
  const parsed = parseRss(xml, {
    sourceId,
    rawPayloadId: `pay-${sourceId}`,
    observedAt: meta.observedAt,
    now: new Date(meta.recordedAt),
  });
  return normalizeParsedItems(parsed.parsedItems, {
    source: profile,
    observedAt: meta.observedAt,
    ingestedAt: meta.recordedAt,
    normalizedAt: meta.recordedAt,
  });
};

const asExternalItem = (n: NormalizedIngestedItem): ExternalItem => ({
  itemId: n.itemId,
  sourceId: n.sourceId,
  sourceItemId: n.sourceItemId,
  sourceEventTime: n.sourceEventTime ?? '',
  observedAt: n.observedAt,
  ingestedAt: n.ingestedAt,
  normalizedAt: n.normalizedAt,
  title: n.title,
  excerpt: n.excerpt ?? '',
  url: n.url,
  authorOrPublisher: n.authorOrPublisher,
  language: n.language,
  tags: n.tags,
  verificationTier: n.verificationTier,
  freshnessState: n.freshnessState,
  dedupeHash: n.dedupeHash,
});

const toIdentity = (n: NormalizedIngestedItem): CanonicalIdentity =>
  toCanonicalIdentity(asExternalItem(n));

const fixedClock: Clock = { now: () => new Date('2026-06-01T00:00:00.000Z') };

const buildClusters = (identities: CanonicalIdentity[]) => {
  const store = new AppendOnlyClusterStore();

  const engine = new ConfirmedClusterEngine(store, fixedClock);
  engine.addAll(identities);
  const identityById = identityIndex(identities);
  return { store, clusters: confirmedClusters(store, identityById) };
};

const pressAll = normalizeFixture(
  FED_PRESS_ALL_FIXTURE_PATHS.xml,
  FED_PRESS_ALL_FIXTURE_PATHS.meta,
  FED_PRESS_ALL_SOURCE_ID,
  pressAllProfile,
);
const monetary = normalizeFixture(
  FED_MONETARY_POLICY.fixturePaths.xml,
  FED_MONETARY_POLICY.fixturePaths.meta,
  FED_MONETARY_POLICY.sourceId,
  FED_MONETARY_POLICY.ingestionProfile,
);

const canonOf = (items: NormalizedIngestedItem[]) =>
  new Set(items.map((i) => canonicalizeUrl(i.url)).filter((u): u is string => !!u));
const pressAllUrls = canonOf(pressAll);
const monetaryUrls = canonOf(monetary);
const sharedUrls = [...monetaryUrls].filter((u) => pressAllUrls.has(u)).sort();

describe('Phase 2.12 cross-feed overlap — recorded press_all vs press_monetary', () => {
  it('both recorded feeds normalize to ≥1 item with canonical URLs', () => {
    expect(pressAll.length).toBeGreaterThan(0);
    expect(monetary.length).toBeGreaterThan(0);
    expect(pressAllUrls.size).toBeGreaterThan(0);
    expect(monetaryUrls.size).toBeGreaterThan(0);
  });

  it('REAL overlap exists: the aggregate feed shares press-release URLs with the subset feed', () => {
    expect(sharedUrls.length).toBeGreaterThan(0);
  });

  it('overlapping items merge into ONE confirmed cluster via canonical_url_exact (cross-source)', () => {
    const { store, clusters } = buildClusters([
      ...pressAll.map(toIdentity),
      ...monetary.map(toIdentity),
    ]);

    for (const url of sharedUrls) {
      const a = pressAll.find((i) => canonicalizeUrl(i.url) === url);
      const b = monetary.find((i) => canonicalizeUrl(i.url) === url);
      expect(a, `press_all item for ${url}`).toBeTruthy();
      expect(b, `monetary item for ${url}`).toBeTruthy();

      const cluster = clusters.find((c) => c.confirmedMemberItemIds.includes(a!.itemId));
      expect(cluster, `cluster for ${url}`).toBeTruthy();

      expect(cluster!.confirmedMemberItemIds).toContain(b!.itemId);

      expect(cluster!.sourceCount).toBe(2);
      expect(cluster!.sourceIds.sort()).toEqual(
        [FED_PRESS_ALL_SOURCE_ID, FED_MONETARY_POLICY.sourceId].sort(),
      );

      const reason = membershipReasonFor(store, cluster!.clusterId, b!.itemId);
      expect(reason?.reasonType).toBe('canonical_url_exact');
    }
  });

  it('merge is by URL, NOT by dedupeHash or sourceItemId (those are source-scoped)', () => {
    const url = sharedUrls[0];
    const a = pressAll.find((i) => canonicalizeUrl(i.url) === url)!;
    const b = monetary.find((i) => canonicalizeUrl(i.url) === url)!;

    expect(a.sourceId).not.toBe(b.sourceId);
    expect(a.dedupeHash).not.toBe(b.dedupeHash);

    expect(canonicalizeUrl(a.url)).toBe(canonicalizeUrl(b.url));
  });

  it('UNDER-MERGE bias: only true URL duplicates cluster; distinct releases stay separate', () => {
    const { clusters } = buildClusters([...pressAll.map(toIdentity), ...monetary.map(toIdentity)]);

    expect(clusters.length).toBe(sharedUrls.length);
    for (const c of clusters) {
      const all = [...pressAll, ...monetary];
      const urls = new Set(
        c.confirmedMemberItemIds
          .map((id) => all.find((i) => i.itemId === id))
          .map((i) => canonicalizeUrl(i?.url)),
      );
      expect(urls.size).toBe(1);
    }
  });

  it('no semantic/fuzzy clustering: distinct-URL items are never co-clustered', () => {
    const { clusters } = buildClusters([...pressAll.map(toIdentity), ...monetary.map(toIdentity)]);
    const co = new Map<string, string>();
    for (const c of clusters) {
      for (const id of c.confirmedMemberItemIds) {
        const item = [...pressAll, ...monetary].find((i) => i.itemId === id)!;
        const u = canonicalizeUrl(item.url)!;
        if (co.has(u)) expect(co.get(u)).toBe(c.clusterId);
        else co.set(u, c.clusterId);
      }
    }
  });
});

describe('Phase 2.12 synthetic overlap regression (clearly synthetic, not recorded)', () => {
  it('the same press-release URL under two Fed sources merges via canonical_url_exact', () => {
    const xml = readFileSync(resolve(repoRoot, FED_MONETARY_POLICY.fixturePaths.xml), 'utf8');
    const meta = JSON.parse(
      readFileSync(resolve(repoRoot, FED_MONETARY_POLICY.fixturePaths.meta), 'utf8'),
    ) as { observedAt: string; recordedAt: string };
    const parsed = parseRss(xml, {
      sourceId: FED_MONETARY_POLICY.sourceId,
      rawPayloadId: 'pay-synthetic',
      observedAt: meta.observedAt,
      now: new Date(meta.recordedAt),
    });
    const withLink = parsed.parsedItems.find((i) => !!i.link);
    expect(withLink).toBeTruthy();

    const opts = {
      observedAt: meta.observedAt,
      ingestedAt: meta.recordedAt,
      normalizedAt: meta.recordedAt,
    };

    const asMonetary = normalizeParsedItems([withLink!], {
      source: FED_MONETARY_POLICY.ingestionProfile,
      ...opts,
    })[0];
    const asPressAll = normalizeParsedItems([withLink!], {
      source: pressAllProfile,
      ...opts,
    })[0];

    expect(asMonetary.sourceId).not.toBe(asPressAll.sourceId);
    expect(asMonetary.itemId).not.toBe(asPressAll.itemId);
    expect(canonicalizeUrl(asMonetary.url)).toBe(canonicalizeUrl(asPressAll.url));

    const { store, clusters } = buildClusters([toIdentity(asPressAll), toIdentity(asMonetary)]);
    expect(clusters).toHaveLength(1);
    const cluster = clusters[0];
    expect(cluster.confirmedMemberCount).toBe(2);
    expect(cluster.sourceCount).toBe(2);
    const reason = membershipReasonFor(store, cluster.clusterId, asMonetary.itemId);
    expect(reason?.reasonType).toBe('canonical_url_exact');
  });
});
