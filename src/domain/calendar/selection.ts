import type { SourceProfile } from '../types';
import type { SkipReason } from '../ingestion/types';
import type { IngestionEligibility } from '../ingestion/selection';
import { CALENDAR_SOURCE_TYPES } from './types';

export const calendarSkipReasonFor = (source: SourceProfile): SkipReason | null => {
  if (source.legalStatus === 'needs_review') return 'legal_status_needs_review';
  if (source.legalStatus === 'disabled') return 'legal_status_disabled';
  if (!source.enabled) return 'not_enabled';
  if (!CALENDAR_SOURCE_TYPES.has(source.sourceType)) {
    return 'unsupported_source_type';
  }
  return null;
};

export const isCalendarFetchEligible = (source: SourceProfile): boolean =>
  source.enabled === true &&
  source.legalStatus === 'allowed' &&
  CALENDAR_SOURCE_TYPES.has(source.sourceType);

export const selectCalendarEligibleSources = (sources: SourceProfile[]): SourceProfile[] =>
  sources.filter(isCalendarFetchEligible);

export const calendarIngestionEligibility = (source: SourceProfile): IngestionEligibility => {
  const reason = calendarSkipReasonFor(source);
  if (reason === null) return 'eligible';
  if (reason === 'legal_status_needs_review') return 'quarantined';
  if (reason === 'legal_status_disabled' || reason === 'not_enabled') {
    return 'disabled';
  }
  return 'unsupported';
};
