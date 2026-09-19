import type { LegalStatus } from '../types';
import type { ImportanceTier, RevisionStatus } from '../calendar';
import type {
  AuditLinkDisplay,
  CalendarConfirmationDisplay,
  ConfirmedClusterDisplay,
  EvidenceDisplay,
  FreshnessDisplay,
  PriorityDisplay,
  VerificationDisplay,
} from '../display';
import type { WhisperInteractionRecord, WhisperInteractionTargetType } from './interactionTypes';

export const WHISPER_RULE_VERSION = 'whisper-rule-v1';

export const MAX_WHISPERS_PER_15_MINUTES = 2;
export const MAX_WHISPERS_PER_HOUR = 5;
export const MAX_WHISPERS_PER_SOURCE_PER_HOUR = 2;
export const MAX_WHISPERS_PER_CLUSTER_PER_2_HOURS = 1;
export const MIN_COOLDOWN_BETWEEN_WHISPERS_MINUTES = 5;
export const DISMISSAL_QUIET_WINDOW_MINUTES = 120;
export const HIGH_IMPORTANCE_CALENDAR_WINDOW_MINUTES = 60;
export const MEDIUM_IMPORTANCE_CALENDAR_WINDOW_MINUTES = 30;
export const WHISPER_CONFIRMED_CLUSTER_MEMBER_THRESHOLD = 3;
export const GLOW_CONFIRMED_CLUSTER_MEMBER_THRESHOLD = 2;

export const MINUTE_MS = 60_000;

export interface WhisperClock {
  now(): number;
}

export type CandidateSourceType = 'item' | 'cluster' | 'calendar_event';
export type WhisperDecisionKind = 'glow' | 'whisper' | 'hold' | 'suppress';
export type EligibilityStatus = 'eligible' | 'ineligible';
export type DismissalTargetType = 'item' | 'cluster' | 'calendar_event' | 'source' | 'global';

export interface WhisperCandidate {
  candidateId: string;
  candidateSourceType: CandidateSourceType;
  itemId?: string;
  clusterId?: string;
  calendarEventId?: string;
  sourceId?: string;

  promotable: boolean;

  sourceLegalStatus: LegalStatus;
  sourceEnabled: boolean;

  containsForbiddenWording?: boolean;
  evidenceDisplay: EvidenceDisplay;
  priorityDisplay: PriorityDisplay;
  verificationDisplay: VerificationDisplay;
  freshnessDisplay: FreshnessDisplay;
  confirmedClusterDisplay?: ConfirmedClusterDisplay | null;
  calendarConfirmationDisplay?: CalendarConfirmationDisplay;
  calendarImportance?: ImportanceTier;
  calendarRevisionStatus?: RevisionStatus;
  auditLinkDisplay: AuditLinkDisplay;
  createdAt: string;
  ruleVersion: string;
}

export interface WhisperEligibilityResult {
  status: EligibilityStatus;
  reasons: string[];
  hardExclusions: string[];
  deterministicInputs: string[];
  ruleVersion: string;
}

export interface RateLimitState {
  whispersLast15m: number;
  whispersLast60m: number;
  perSourceLast60m: number;
  perClusterLast120m: number;
}

export interface CooldownState {
  lastWhisperAt?: string;
  msSinceLastWhisper?: number;
  cooldownActive: boolean;
}

export interface QuietWindowState {
  blocked: boolean;
  activeDismissalTargets: string[];
}

export interface WhisperDecision {
  decisionId: string;
  candidateId: string;
  decision: WhisperDecisionKind;
  reason: string;
  deterministicInputs: string[];
  eligibilityResult: WhisperEligibilityResult;
  rateLimitState: RateLimitState;
  cooldownState: CooldownState;
  quietWindowState: QuietWindowState;
  createdAt: string;
  ruleVersion: string;
}

export interface WhisperDecisionView {
  decisionId: string;
  candidateSourceType: CandidateSourceType;

  level: WhisperDecisionKind;

  message: string;
  reason: string;
  ruleVersion: string;

  targetType: WhisperInteractionTargetType;
  targetId: string;

  priorityReason?: string;
  verificationTier?: string;
  freshnessState?: string;
  evidenceLabel?: string;
  evidenceRef?: string;
  evidenceHref?: string;
  auditLabel?: string;
  auditHref?: string;
  clusterId?: string;
  confirmedMemberCount?: number;
  clusterRuleVersion?: string;
  scheduledFor?: string | null;
  confirmationState?: string;
}

export interface WhisperDecisionRecord {
  recordId: string;
  decisionId: string;
  candidateId: string;
  candidateSourceType: CandidateSourceType;
  decision: WhisperDecisionKind;
  itemId?: string;
  clusterId?: string;
  calendarEventId?: string;
  sourceId?: string;

  priorityReason?: string;
  confirmedMemberCount?: number;
  calendarSignature?: string;
  createdAt: string;
  ruleVersion: string;
  reason: string;
}

export interface WhisperDismissalRecord {
  dismissalId: string;
  targetType: DismissalTargetType;
  targetId: string;
  dismissedAt: string;
  quietUntil: string;
  reason?: string;
  ruleVersion: string;
}

export interface WhisperHistorySnapshot {
  decisionRecords: readonly WhisperDecisionRecord[];
  dismissalRecords: readonly WhisperDismissalRecord[];

  interactionRecords: readonly WhisperInteractionRecord[];
  capturedAt: string;
  ruleVersion: string;
}

export interface WhisperHistoryStore {
  getSnapshot(): WhisperHistorySnapshot;
  appendDecision(record: WhisperDecisionRecord): void;
  appendDismissal(record: WhisperDismissalRecord): void;

  appendInteraction(record: WhisperInteractionRecord): void;
}
