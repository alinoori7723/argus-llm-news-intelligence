export const WHISPER_DECISIONS_STREAM = 'whisper-decisions';

export const WHISPER_DISMISSALS_STREAM = 'whisper-dismissals';

export const WHISPER_INTERACTIONS_STREAM = 'whisper-interactions';

export type WhisperPersistenceStreamName =
  | typeof WHISPER_DECISIONS_STREAM
  | typeof WHISPER_DISMISSALS_STREAM
  | typeof WHISPER_INTERACTIONS_STREAM;

export const WHISPER_STREAM_ORDER: readonly WhisperPersistenceStreamName[] = [
  WHISPER_DECISIONS_STREAM,
  WHISPER_DISMISSALS_STREAM,
  WHISPER_INTERACTIONS_STREAM,
];

export const WHISPER_STREAM_NAMES: ReadonlySet<string> = new Set(WHISPER_STREAM_ORDER);

export const whisperStreamOrderIndex = (streamName: string): number => {
  const i = WHISPER_STREAM_ORDER.indexOf(streamName as WhisperPersistenceStreamName);
  return i === -1 ? WHISPER_STREAM_ORDER.length : i;
};

export const isWhisperStreamName = (
  streamName: string,
): streamName is WhisperPersistenceStreamName => WHISPER_STREAM_NAMES.has(streamName);

export const WHISPER_PERSISTENCE_PRODUCER_VERSION = 'whisper-persistence-v1';

export const WHISPER_PERSISTENCE_SOURCE_PHASE = 'phase-2-14';

export const WHISPER_DECISION_SCHEMA_VERSION = 'whisper-decision-record-v1';
export const WHISPER_DISMISSAL_SCHEMA_VERSION = 'whisper-dismissal-record-v1';
export const WHISPER_INTERACTION_SCHEMA_VERSION = 'whisper-interaction-record-v1';
