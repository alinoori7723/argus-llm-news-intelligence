import { runRecordedIngestion } from '../src/domain/ingestion/runIngestion';
import { PersistenceBackedIngestionStore } from '../src/domain/ingestion/persistenceBackedIngestionStore';
import { InMemoryAppendOnlyPersistenceStore } from '../src/domain/persistence/inMemoryAppendOnlyStore';
import { canonicalizeUrl } from '../src/domain/clustering/normalizeUrl';
import { decideDedupe } from '../src/domain/clustering/dedupe';
import { DEDUPE_RULE_VERSION, type CanonicalIdentity } from '../src/domain/clustering/types';
import { datasetSchema, type Dataset, type EvidenceItem, type Snapshot } from './contracts';
import { contentHash, sha256 } from './hash';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const xmlEscape = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

function canonicalDataset(value: unknown): Dataset {
  const dataset = datasetSchema.parse(value);
  return {
    ...dataset,
    sources: [...dataset.sources].sort((a, b) => compare(a.id, b.id)),
    articles: [...dataset.articles].sort((a, b) =>
      compare(`${a.sourceId}::${a.id}`, `${b.sourceId}::${b.id}`),
    ),
  };
}

function identity(item: EvidenceItem): CanonicalIdentity {
  return {
    itemId: item.itemId,
    sourceId: item.sourceId,
    sourceItemId: item.id,
    url: item.url,
    canonicalUrl: item.canonicalUrl,
    dedupeHash: item.contentHash,
    assetTags: [],
    topicTags: [item.category],
    observedAt: item.observedAt,
    sourceEventTime: item.sourceEventTime,
    ruleVersion: DEDUPE_RULE_VERSION,
  };
}

export function ingestDataset(input: unknown): Snapshot {
  const dataset = canonicalDataset(input);
  const datasetHash = contentHash(dataset);
  const store = new PersistenceBackedIngestionStore(new InMemoryAppendOnlyPersistenceStore());
  const clock = { now: () => new Date(dataset.observedAt) };
  const quarantined: Snapshot['quarantined'] = [];
  for (const source of dataset.sources) {
    const articles = dataset.articles.filter((article) => article.sourceId === source.id);
    const payloadText = `<rss version="2.0"><channel><title>${xmlEscape(source.name)}</title>${articles
      .map(
        (article) =>
          `<item><guid>${xmlEscape(article.id)}</guid><title>${xmlEscape(article.title)}</title><description>${xmlEscape(article.text)}</description><link>${xmlEscape(article.url)}</link>${article.publishedAt ? `<pubDate>${new Date(article.publishedAt).toUTCString()}</pubDate>` : ''}</item>`,
      )
      .join('')}</channel></rss>`;
    const run = runRecordedIngestion({
      source: {
        sourceId: source.id,
        name: source.name,
        sourceTier: source.tier,
        legalStatus: source.legalStatus,
        enabled: source.enabled,
        sourceType: 'rss_fixture',
        accessMethod: 'dataset-to-rss',
        trustNotes: dataset.description,
        freshnessExpectation: 'recorded dataset',
        defaultAssetTags: [],
        defaultTopicTags: [],
      },
      payloadText,
      store,
      clock,
      fetcherVersion: 'dataset-adapter-v1',
    });
    if (run.status === 'skipped') {
      quarantined.push(
        ...articles.map((article) => ({
          itemId: `${source.id}::${article.id}`,
          reason: run.skipReason ?? 'source_ineligible',
        })),
      );
    }
  }
  const rawPayloads = store.rawPayloads
    .filter((payload) => payload.payloadText !== undefined)
    .map((payload) => ({
      id: payload.rawPayloadId,
      sourceId: payload.sourceId,
      sha256: sha256(payload.payloadText ?? ''),
      text: payload.payloadText ?? '',
    }));
  const articleMap = new Map(
    dataset.articles.map((article) => [`${article.sourceId}::${article.id}`, article]),
  );
  const items: EvidenceItem[] = store.normalizedItems
    .map((normalized) => {
      const article = articleMap.get(normalized.itemId);
      const raw = rawPayloads.find((payload) => payload.id === normalized.rawPayloadId);
      if (!article || !raw) throw new Error('Missing source lineage');
      return {
        ...article,
        title: normalized.title,
        text: normalized.excerpt ?? '',
        itemId: normalized.itemId,
        canonicalUrl: canonicalizeUrl(normalized.url) ?? article.url,
        rawPayloadId: raw.id,
        rawPayloadHash: raw.sha256,
        contentHash: contentHash({ title: normalized.title, text: normalized.excerpt ?? '' }),
        parserVersion: normalized.parserVersion,
        processingVersion: normalized.processingVersion,
        observedAt: normalized.observedAt,
        sourceEventTime: normalized.sourceEventTime,
        verificationTier: normalized.verificationTier,
      };
    })
    .sort((a, b) => compare(a.itemId, b.itemId));
  quarantined.push(
    ...store.malformedItems.map((item) => ({ itemId: item.malformedItemId, reason: item.reason })),
  );
  const parent = new Map(items.map((item) => [item.itemId, item.itemId]));
  const find = (id: string): string => {
    const next = parent.get(id)!;
    if (next === id) return id;
    const root = find(next);
    parent.set(id, root);
    return root;
  };
  const decisions: Snapshot['decisions'] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const match = decideDedupe(identity(items[i]), identity(items[j]));
      if (match.decision !== 'same') continue;
      const roots = [find(items[i].itemId), find(items[j].itemId)].sort(compare);
      parent.set(roots[1], roots[0]);
      decisions.push({
        itemA: items[i].itemId,
        itemB: items[j].itemId,
        rule: match.reasonType,
        evidence: match.evidence ?? match.reasonDetail,
      });
    }
  }
  const groups = new Map<string, EvidenceItem[]>();
  for (const item of items) {
    const key = find(item.itemId);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const clusters = [...groups.values()].map((group) => ({
    id: `cluster-${contentHash(group.map((item) => item.itemId)).slice(0, 16)}`,
    title: group[0].title,
    category: group[0].category,
    itemIds: group.map((item) => item.itemId),
    sourceIds: [...new Set(group.map((item) => item.sourceId))].sort(compare),
    eligible: group.every(
      (item) => item.sourceEventTime !== null && item.verificationTier === 'reported',
    ),
    ruleVersion: `${DEDUPE_RULE_VERSION}/connected-components-v1`,
  }));
  return {
    id: `snapshot-${datasetHash.slice(0, 16)}`,
    dataset,
    datasetHash,
    items,
    clusters,
    decisions,
    quarantined,
    rawPayloads,
    counts: {
      input: dataset.articles.length,
      ingested: items.length,
      quarantined: quarantined.length,
      duplicates: items.length - clusters.length,
      clusters: clusters.length,
    },
  };
}
