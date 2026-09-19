import type { ExternalItem, FixtureSnapshot, SourceProfile } from '../types';
import type { NormalizedIngestedItem } from './types';

export const toExternalItem = (n: NormalizedIngestedItem): ExternalItem | null => {
  if (n.sourceEventTime === null) return null;
  return {
    itemId: n.itemId,
    sourceId: n.sourceId,
    sourceItemId: n.sourceItemId,
    sourceEventTime: n.sourceEventTime,
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
  };
};

export const buildIngestedSnapshot = (args: {
  generatedAt: string;
  sources: SourceProfile[];
  normalizedItems: readonly NormalizedIngestedItem[];
}): FixtureSnapshot => ({
  generatedAt: args.generatedAt,
  sources: args.sources,
  items: args.normalizedItems.map(toExternalItem).filter((x): x is ExternalItem => x !== null),
  clusters: [],
});
