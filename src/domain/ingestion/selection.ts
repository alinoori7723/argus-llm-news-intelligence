import type { FixtureSnapshot, SourceProfile } from '../types';
import { SUPPORTED_SOURCE_TYPES, type SkipReason } from './types';

export const skipReasonFor = (source: SourceProfile): SkipReason | null => {
  if (source.legalStatus === 'needs_review') return 'legal_status_needs_review';
  if (source.legalStatus === 'disabled') return 'legal_status_disabled';
  if (!source.enabled) return 'not_enabled';
  if (!SUPPORTED_SOURCE_TYPES.has(source.sourceType)) {
    return 'unsupported_source_type';
  }
  return null;
};

export const isFetchEligible = (source: SourceProfile): boolean =>
  source.enabled === true &&
  source.legalStatus === 'allowed' &&
  SUPPORTED_SOURCE_TYPES.has(source.sourceType);

export const selectFetchEligibleSources = (sources: SourceProfile[]): SourceProfile[] =>
  sources.filter(isFetchEligible);

export const fetchEligibleSourcesIn = (snapshot: FixtureSnapshot): SourceProfile[] =>
  selectFetchEligibleSources(snapshot.sources);

export type IngestionEligibility = 'eligible' | 'quarantined' | 'disabled' | 'unsupported';

export const ingestionEligibility = (source: SourceProfile): IngestionEligibility => {
  const reason = skipReasonFor(source);
  if (reason === null) return 'eligible';
  if (reason === 'legal_status_needs_review') return 'quarantined';
  if (reason === 'legal_status_disabled' || reason === 'not_enabled') {
    return 'disabled';
  }
  return 'unsupported';
};
