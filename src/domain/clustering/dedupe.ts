import type { CanonicalIdentity, ClusterReasonType } from './types';

export interface SameMatch {
  decision: 'same';
  reasonType: ClusterReasonType;
  reasonDetail: string;
  evidence?: string;
}
export interface DifferentMatch {
  decision: 'different';
  reasonDetail: string;
}
export type DedupeMatch = SameMatch | DifferentMatch;

export interface DedupeOptions {
  allowStrictTitle?: boolean;
}

export const TITLE_MATCH_WINDOW_MS = 6 * 60 * 60 * 1000;

const setsEqual = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const withinTitleWindow = (a: CanonicalIdentity, b: CanonicalIdentity): boolean => {
  const ta = Date.parse(a.observedAt);
  const tb = Date.parse(b.observedAt);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(ta - tb) <= TITLE_MATCH_WINDOW_MS;
};

const strictTitleMatch = (a: CanonicalIdentity, b: CanonicalIdentity): boolean => {
  if (!a.normalizedTitle || !b.normalizedTitle) return false;
  if (a.normalizedTitle !== b.normalizedTitle) return false;
  if (a.assetTags.length === 0 && a.topicTags.length === 0) return false;
  if (!setsEqual(a.assetTags, b.assetTags)) return false;
  if (!setsEqual(a.topicTags, b.topicTags)) return false;
  return withinTitleWindow(a, b);
};

export const decideDedupe = (
  a: CanonicalIdentity,
  b: CanonicalIdentity,
  opts: DedupeOptions = {},
): DedupeMatch => {
  if (a.itemId === b.itemId) {
    return {
      decision: 'same',
      reasonType: 'same_item_id_noop',
      reasonDetail: 'identical itemId (no-op)',
      evidence: a.itemId,
    };
  }

  if (
    a.sourceId === b.sourceId &&
    a.sourceItemId &&
    b.sourceItemId &&
    a.sourceItemId === b.sourceItemId
  ) {
    return {
      decision: 'same',
      reasonType: 'source_item_id_exact',
      reasonDetail: `same source ${a.sourceId} + sourceItemId ${a.sourceItemId}`,
      evidence: a.sourceItemId,
    };
  }

  if (a.canonicalUrl && b.canonicalUrl && a.canonicalUrl === b.canonicalUrl) {
    return {
      decision: 'same',
      reasonType: 'canonical_url_exact',
      reasonDetail: `same canonicalUrl ${a.canonicalUrl}`,
      evidence: a.canonicalUrl,
    };
  }

  if (a.dedupeHash && b.dedupeHash && a.dedupeHash === b.dedupeHash) {
    return {
      decision: 'same',
      reasonType: 'dedupe_hash_exact',
      reasonDetail: `same dedupeHash ${a.dedupeHash}`,
      evidence: a.dedupeHash,
    };
  }

  if (opts.allowStrictTitle && strictTitleMatch(a, b)) {
    return {
      decision: 'same',
      reasonType: 'normalized_title_exact_strict',
      reasonDetail: `exact normalized title "${a.normalizedTitle}" + identical tags + within window`,
      evidence: a.normalizedTitle,
    };
  }

  return { decision: 'different', reasonDetail: 'no exact deterministic match' };
};
