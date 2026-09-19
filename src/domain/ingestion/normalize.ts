import type { SourceProfile, Tag } from '../types';
import { sanitizeText, stableHash } from './sanitize';
import {
  INGESTION_PROCESSING_VERSION,
  type NormalizedIngestedItem,
  type ParsedRssItem,
  type SourceEventTimeStatus,
} from './types';

export interface NormalizeOptions {
  source: SourceProfile;
  observedAt: string;
  ingestedAt: string;
  normalizedAt: string;
  processingVersion?: string;
}

const defaultTagsFor = (source: SourceProfile): Tag[] => {
  const assetTags: Tag[] = source.defaultAssetTags.map((value) => ({
    tagId: `t.${source.sourceId}.asset.${value.toLowerCase()}`,
    tagType: 'asset',
    tagValue: value,
    provenance: 'deterministic',
  }));
  const topicTags: Tag[] = source.defaultTopicTags.map((value) => ({
    tagId: `t.${source.sourceId}.topic.${value.toLowerCase()}`,
    tagType: 'topic',
    tagValue: value,
    provenance: 'deterministic',
  }));
  return [...assetTags, ...topicTags];
};

const eventTimeStatusFor = (item: ParsedRssItem): SourceEventTimeStatus => {
  if (item.pubDateState === 'valid') return 'known';
  if (item.pubDateState === 'future') return 'caveat_future';
  return 'unknown';
};

export const normalizeParsedItem = (
  item: ParsedRssItem,
  opts: NormalizeOptions,
): NormalizedIngestedItem => {
  const processingVersion = opts.processingVersion ?? INGESTION_PROCESSING_VERSION;
  const title = sanitizeText(item.title);
  const excerpt = item.excerpt ? sanitizeText(item.excerpt) : undefined;
  const sourceEventTimeStatus = eventTimeStatusFor(item);

  return {
    itemId: `${opts.source.sourceId}::${item.sourceItemId}`,
    sourceId: opts.source.sourceId,
    sourceItemId: item.sourceItemId,
    sourceEventTime: item.sourceEventTime,
    sourceEventTimeStatus,
    observedAt: opts.observedAt,
    ingestedAt: opts.ingestedAt,
    normalizedAt: opts.normalizedAt,
    title,
    excerpt,
    url: item.link,
    authorOrPublisher: item.authorOrPublisher,
    language: 'en',
    tags: defaultTagsFor(opts.source),

    verificationTier: sourceEventTimeStatus === 'known' ? 'reported' : 'unverified',
    freshnessState: sourceEventTimeStatus === 'known' ? 'live' : 'unknown',
    dedupeHash: `h.${opts.source.sourceId}.${stableHash(`${item.sourceItemId}|${title}`)}`,
    rawPayloadId: item.rawPayloadId,
    parserVersion: item.parserVersion,
    processingVersion,
  };
};

export const normalizeParsedItems = (
  items: ParsedRssItem[],
  opts: NormalizeOptions,
): NormalizedIngestedItem[] => items.map((i) => normalizeParsedItem(i, opts));
