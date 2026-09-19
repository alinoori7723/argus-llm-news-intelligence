import { fixedClock } from '@/domain/ingestion';
import { InMemoryAppendOnlyPersistenceStore } from '@/domain/persistence';
import {
  PersistenceBackedClusterStore,
  ConfirmedClusterEngine,
  canonicalizeUrl,
  normalizeTitle,
  DEDUPE_RULE_VERSION,
  identityIndex,
  type CanonicalIdentity,
  type ClusterStore,
} from '@/domain/clustering';

export const CLUSTER_A_ID = 'ccl-it.a1';
export const DEMO_CLUSTER_INSTANT = '2026-05-31T09:30:00.000Z';

const at = (hhmm: string) => `2026-05-31T${hhmm}:00.000Z`;

interface Seed {
  itemId: string;
  sourceId: string;
  sourceItemId?: string;
  url?: string;
  title: string;
  dedupeHash: string;
  assetTags: string[];
  topicTags: string[];
  observedAt: string;
}

const makeIdentity = (s: Seed): CanonicalIdentity => {
  const normalizedTitle = normalizeTitle(s.title);
  return {
    itemId: s.itemId,
    sourceId: s.sourceId,
    sourceItemId: s.sourceItemId,
    url: s.url,
    canonicalUrl: canonicalizeUrl(s.url),
    normalizedTitle: normalizedTitle === '' ? undefined : normalizedTitle,
    dedupeHash: s.dedupeHash,
    assetTags: [...s.assetTags].sort(),
    topicTags: [...s.topicTags].sort(),
    observedAt: s.observedAt,
    sourceEventTime: s.observedAt,
    ruleVersion: DEDUPE_RULE_VERSION,
  };
};

const A1 = makeIdentity({
  itemId: 'it.a1',
  sourceId: 'src.wire.a',
  sourceItemId: 'wireA-fed-1',
  url: 'https://News.Example/fed-holds-rates?utm_source=tw&utm_campaign=x#top',
  title: 'Fed Holds Rates',
  dedupeHash: 'h.fed.holds.canonical',
  assetTags: ['DXY'],
  topicTags: ['central-bank'],
  observedAt: at('09:00'),
});
const A2 = makeIdentity({
  itemId: 'it.a2',
  sourceId: 'src.wire.b',
  sourceItemId: 'wireB-fed-1',
  url: 'https://news.example/fed-holds-rates',
  title: 'Fed holds rates',
  dedupeHash: 'h.fed.holds.b',
  assetTags: ['DXY'],
  topicTags: ['central-bank'],
  observedAt: at('09:05'),
});
const A3 = makeIdentity({
  itemId: 'it.a3',
  sourceId: 'src.dataset.c',
  sourceItemId: 'dsC-fed-1',
  url: 'https://datasrc.example/d/123',
  title: 'Federal Reserve keeps rates unchanged',
  dedupeHash: 'h.fed.holds.canonical',
  assetTags: ['DXY'],
  topicTags: ['central-bank'],
  observedAt: at('09:10'),
});
const A4 = makeIdentity({
  itemId: 'it.a4',
  sourceId: 'src.wire.a',
  sourceItemId: 'wireA-fed-1',
  url: 'https://news.example/fed-holds-rates-amp',
  title: 'Fed Holds Rates (amp)',
  dedupeHash: 'h.fed.amp',
  assetTags: ['DXY'],
  topicTags: ['central-bank'],
  observedAt: at('09:02'),
});
const A5 = makeIdentity({
  itemId: 'it.a5',
  sourceId: 'src.wire.d',
  sourceItemId: 'wireD-fed-1',
  url: 'https://news.example/fed-holds-rates?gclid=abc',
  title: 'Fed holds rates',
  dedupeHash: 'h.fed.holds.d',
  assetTags: ['DXY'],
  topicTags: ['central-bank'],
  observedAt: at('09:20'),
});

const N1 = makeIdentity({
  itemId: 'it.n1',
  sourceId: 'src.wire.a',
  sourceItemId: 'wireA-ecb-1',
  url: 'https://news.example/ecb-statement',
  title: 'ECB statement',
  dedupeHash: 'h.ecb.1',
  assetTags: ['EUR'],
  topicTags: ['central-bank'],
  observedAt: at('09:00'),
});
const N2 = makeIdentity({
  itemId: 'it.n2',
  sourceId: 'src.wire.b',
  sourceItemId: 'wireB-ecb-1',
  url: 'https://news.example/ecb-statement-summary',
  title: 'ECB statement summary',
  dedupeHash: 'h.ecb.2',
  assetTags: ['EUR'],
  topicTags: ['central-bank'],
  observedAt: at('09:05'),
});

export const SCENARIO_IDENTITIES: CanonicalIdentity[] = [A1, A2, A3, A4, A5, N1, N2];

export interface ClusterScenario {
  store: ClusterStore;
  engine: ConfirmedClusterEngine;
  identities: CanonicalIdentity[];
  identityById: Record<string, CanonicalIdentity>;
}

export const buildClusterScenario = (instant: string = DEMO_CLUSTER_INSTANT): ClusterScenario => {
  const store = new PersistenceBackedClusterStore(new InMemoryAppendOnlyPersistenceStore());
  const engine = new ConfirmedClusterEngine(store, fixedClock(instant));
  engine.addAll([A1, A2, A3, A4, N1, N2]);
  engine.add(A5);
  engine.removeMemberAsError(
    CLUSTER_A_ID,
    'it.a4',
    'duplicate AMP ingest removed as mistaken member',
  );
  return {
    store,
    engine,
    identities: SCENARIO_IDENTITIES,
    identityById: identityIndex(SCENARIO_IDENTITIES),
  };
};
