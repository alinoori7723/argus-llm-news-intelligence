import { deepClone, deepFreeze, type PersistedRecord } from '../persistence';
import {
  WHISPER_RULE_VERSION,
  type WhisperDecisionRecord,
  type WhisperDismissalRecord,
  type WhisperHistorySnapshot,
} from './types';
import type { WhisperInteractionRecord } from './interactionTypes';
import {
  WHISPER_DECISIONS_STREAM,
  WHISPER_DISMISSALS_STREAM,
  WHISPER_INTERACTIONS_STREAM,
  isWhisperStreamName,
  whisperStreamOrderIndex,
} from './whisperPersistenceStreams';

export const compareWhisperRecordsGlobally = (a: PersistedRecord, b: PersistedRecord): number => {
  if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? -1 : 1;
  const sa = whisperStreamOrderIndex(a.streamName);
  const sb = whisperStreamOrderIndex(b.streamName);
  if (sa !== sb) return sa - sb;
  if (a.sequence !== b.sequence) return a.sequence - b.sequence;
  if (a.recordId !== b.recordId) return a.recordId < b.recordId ? -1 : 1;
  return 0;
};

export const orderWhisperRecordsGlobally = (
  records: readonly PersistedRecord[],
): PersistedRecord[] => [...records].sort(compareWhisperRecordsGlobally);

interface BuildOptions {
  capturedAt?: string;
}

export const buildWhisperSnapshot = (
  records: readonly PersistedRecord[],
  options: BuildOptions = {},
): WhisperHistorySnapshot => {
  const seenIds = new Set<string>();
  const byStream = new Map<string, PersistedRecord[]>();

  for (const record of records) {
    if (!isWhisperStreamName(record.streamName)) continue;
    if (seenIds.has(record.recordId)) {
      throw new Error(`whisper replay: duplicate recordId "${record.recordId}" in history`);
    }
    seenIds.add(record.recordId);
    const list = byStream.get(record.streamName) ?? [];
    list.push(record);
    byStream.set(record.streamName, list);
  }

  for (const [streamName, list] of byStream) {
    const sequences = list.map((r) => r.sequence).sort((x, y) => x - y);
    sequences.forEach((seq, i) => {
      if (seq !== i) {
        throw new Error(
          `whisper replay: stream "${streamName}" has non-contiguous sequence ` +
            `(expected ${i}, got ${seq})`,
        );
      }
    });
  }

  const orderedPayloads = <T>(streamName: string): T[] =>
    (byStream.get(streamName) ?? [])
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((r) => deepFreeze(deepClone(r.payload)) as T);

  const decisionRecords = orderedPayloads<WhisperDecisionRecord>(WHISPER_DECISIONS_STREAM);
  const dismissalRecords = orderedPayloads<WhisperDismissalRecord>(WHISPER_DISMISSALS_STREAM);
  const interactionRecords = orderedPayloads<WhisperInteractionRecord>(WHISPER_INTERACTIONS_STREAM);

  return deepFreeze({
    decisionRecords: Object.freeze(decisionRecords),
    dismissalRecords: Object.freeze(dismissalRecords),
    interactionRecords: Object.freeze(interactionRecords),
    capturedAt: options.capturedAt ?? '',
    ruleVersion: WHISPER_RULE_VERSION,
  });
};

export const replayWhisperHistory = (
  records: readonly PersistedRecord[],
  options: BuildOptions = {},
): WhisperHistorySnapshot => {
  for (const record of records) {
    if (!isWhisperStreamName(record.streamName)) {
      throw new Error(
        `whisper replay: unknown stream "${record.streamName}" is not a Whisper ` +
          `history stream (expected one of whisper-decisions / whisper-dismissals / ` +
          `whisper-interactions)`,
      );
    }
  }
  return buildWhisperSnapshot(records, options);
};
