import type { AppendOnlyPersistenceStore } from '../persistence';
import type {
  WhisperClock,
  WhisperDecisionRecord,
  WhisperDismissalRecord,
  WhisperHistorySnapshot,
  WhisperHistoryStore,
} from './types';
import type { WhisperInteractionRecord } from './interactionTypes';
import { isoFromMs } from './clock';
import {
  mapDecisionToInput,
  mapDismissalToInput,
  mapInteractionToInput,
} from './whisperPersistenceMapping';
import { buildWhisperSnapshot } from './whisperPersistenceReplay';
import {
  WHISPER_DECISIONS_STREAM,
  WHISPER_DISMISSALS_STREAM,
  WHISPER_INTERACTIONS_STREAM,
} from './whisperPersistenceStreams';

export class PersistenceBackedWhisperHistoryStore implements WhisperHistoryStore {
  constructor(
    private readonly store: AppendOnlyPersistenceStore,

    private readonly clock?: WhisperClock,
  ) {}

  appendDecision(record: WhisperDecisionRecord): void {
    const streamSequence = this.store.readStream(WHISPER_DECISIONS_STREAM).length;
    this.store.append(mapDecisionToInput(record, streamSequence));
  }

  appendDismissal(record: WhisperDismissalRecord): void {
    const streamSequence = this.store.readStream(WHISPER_DISMISSALS_STREAM).length;
    this.store.append(mapDismissalToInput(record, streamSequence));
  }

  appendInteraction(record: WhisperInteractionRecord): void {
    const streamSequence = this.store.readStream(WHISPER_INTERACTIONS_STREAM).length;
    this.store.append(mapInteractionToInput(record, streamSequence));
  }

  getSnapshot(): WhisperHistorySnapshot {
    const records = [
      ...this.store.readStream(WHISPER_DECISIONS_STREAM),
      ...this.store.readStream(WHISPER_DISMISSALS_STREAM),
      ...this.store.readStream(WHISPER_INTERACTIONS_STREAM),
    ];
    const capturedAt = this.clock ? isoFromMs(this.clock.now()) : '';
    return buildWhisperSnapshot(records, { capturedAt });
  }

  get decisionCount(): number {
    return this.store.readStream(WHISPER_DECISIONS_STREAM).length;
  }
  get dismissalCount(): number {
    return this.store.readStream(WHISPER_DISMISSALS_STREAM).length;
  }
  get interactionCount(): number {
    return this.store.readStream(WHISPER_INTERACTIONS_STREAM).length;
  }
}
