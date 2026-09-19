export type WhisperInteractionType = 'dismiss' | 'mark_seen' | 'open_audit' | 'open_evidence';

export type WhisperInteractionTargetType = 'decision' | 'item' | 'cluster' | 'calendar_event';

export type WhisperInteractionReason =
  | 'not_relevant'
  | 'already_known'
  | 'too_noisy'
  | 'reviewed'
  | 'unspecified';

export interface WhisperInteractionIntent {
  intentId: string;
  interactionType: WhisperInteractionType;
  targetType: WhisperInteractionTargetType;
  targetId: string;
  decisionId?: string;
  candidateId?: string;
  itemId?: string;
  clusterId?: string;
  calendarEventId?: string;
  sourceId?: string;
  reason?: WhisperInteractionReason;
}

export interface WhisperViewIdentity {
  decisionId: string;
  targetType: WhisperInteractionTargetType;
  targetId: string;
}

export type WhisperInteractionStatus = 'recorded' | 'ignored' | 'rejected';

export type AppendedRecordKind = 'dismissal' | 'interaction';

export interface AppendedRecordRef {
  kind: AppendedRecordKind;
  recordId: string;
}

export interface WhisperInteractionRecord {
  recordId: string;
  intentId: string;
  interactionType: WhisperInteractionType;
  targetType: WhisperInteractionTargetType;
  targetId: string;
  decisionId?: string;
  itemId?: string;
  clusterId?: string;
  calendarEventId?: string;
  sourceId?: string;
  recordedAt: string;
  ruleVersion: string;
  reason?: string;
}

export interface WhisperInteractionResult {
  resultId: string;
  intentId: string;
  interactionType: WhisperInteractionType;
  status: WhisperInteractionStatus;
  reason: string;
  recordedAt: string;
  ruleVersion: string;
  appendedRecords: AppendedRecordRef[];
  deterministicInputs: string[];
}
