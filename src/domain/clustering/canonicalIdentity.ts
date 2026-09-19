import type { ExternalItem, Tag } from '../types';
import { canonicalizeUrl } from './normalizeUrl';
import { normalizeTitle } from './normalizeTitle';
import { DEDUPE_RULE_VERSION, type CanonicalIdentity } from './types';

const usableTags = (tags: Tag[]) =>
  tags.filter((t) => t.provenance === 'deterministic' || t.provenance === 'user_confirmed');

const tagValues = (tags: Tag[], types: ReadonlyArray<Tag['tagType']>): string[] =>
  Array.from(
    new Set(
      usableTags(tags)
        .filter((t) => types.includes(t.tagType))
        .map((t) => t.tagValue),
    ),
  ).sort();

export const toCanonicalIdentity = (item: ExternalItem): CanonicalIdentity => {
  const normalizedTitle = normalizeTitle(item.title);
  return {
    itemId: item.itemId,
    sourceId: item.sourceId,
    sourceItemId: item.sourceItemId || undefined,
    url: item.url,
    canonicalUrl: canonicalizeUrl(item.url),
    normalizedTitle: normalizedTitle === '' ? undefined : normalizedTitle,
    dedupeHash: item.dedupeHash,
    assetTags: tagValues(item.tags, ['asset']),
    topicTags: tagValues(item.tags, ['topic', 'macro']),
    observedAt: item.observedAt,
    sourceEventTime: item.sourceEventTime ?? null,
    ruleVersion: DEDUPE_RULE_VERSION,
  };
};
