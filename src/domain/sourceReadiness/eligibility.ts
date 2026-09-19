import {
  SOURCE_READINESS_RULE_VERSION,
  type SourceReadinessDecision,
  type SourceReadinessProfile,
  type SourceReadinessSkipReason,
} from './types';

const isFinitePositive = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;

const OFFLINE_READY_MODES = new Set(['recorded_fixture', 'manual_recording_ready']);

export const evaluateSourceReadinessEligibility = (
  profile: SourceReadinessProfile,
): SourceReadinessDecision => {
  const deterministicInputs = [
    `enabled=${profile.enabled}`,
    `legalStatus=${profile.legalStatus ?? 'absent'}`,
    `tosStatus=${profile.tosStatus ?? 'absent'}`,
    `parserSupport=${profile.parserSupport ?? 'absent'}`,
    `acquisitionMode=${profile.acquisitionMode ?? 'absent'}`,
    `allowedContentTypes=${(profile.allowedContentTypes ?? []).length}`,
    `maxPayloadBytes=${profile.maxPayloadBytes ?? 'absent'}`,
    `timeoutMs=${profile.timeoutMs ?? 'absent'}`,
  ];

  const skip = (skipReason: SourceReadinessSkipReason): SourceReadinessDecision => ({
    sourceId: profile.sourceId,
    status: 'skipped',
    skipReason,
    deterministicInputs,
    ruleVersion: SOURCE_READINESS_RULE_VERSION,
  });

  if (profile.enabled !== true) {
    return skip(profile.enabled === false ? 'source_disabled' : 'source_not_enabled');
  }

  switch (profile.legalStatus) {
    case 'allowed':
      break;
    case 'needs_review':
      return skip('source_legal_needs_review');
    case 'blocked':
      return skip('source_legal_blocked');
    case 'unknown':
      return skip('source_legal_unknown');
    default:
      return skip('source_missing_legal_status');
  }

  switch (profile.tosStatus) {
    case 'allowed':
      break;
    case 'needs_review':
      return skip('tos_needs_review');
    case 'blocked':
      return skip('tos_blocked');
    case 'unknown':
      return skip('tos_unknown');
    default:
      return skip('tos_missing');
  }

  if (profile.parserSupport !== 'supported') {
    return skip('parser_unsupported');
  }

  if (!OFFLINE_READY_MODES.has(profile.acquisitionMode)) {
    return skip('acquisition_mode_not_offline_ready');
  }

  if (!Array.isArray(profile.allowedContentTypes) || profile.allowedContentTypes.length === 0) {
    return skip('content_type_unsupported');
  }

  if (!isFinitePositive(profile.maxPayloadBytes)) {
    return skip('max_payload_missing');
  }

  if (!isFinitePositive(profile.timeoutMs)) {
    return skip('timeout_missing');
  }

  return {
    sourceId: profile.sourceId,
    status: 'eligible',
    deterministicInputs,
    ruleVersion: SOURCE_READINESS_RULE_VERSION,
  };
};
