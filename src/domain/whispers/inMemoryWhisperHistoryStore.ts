import type {
  WhisperClock,
  WhisperDecisionRecord,
  WhisperDismissalRecord,
  WhisperHistorySnapshot,
  WhisperHistoryStore,
} from './types';
import type { WhisperInteractionRecord } from './interactionTypes';
import { WHISPER_RULE_VERSION } from './types';
import { isoFromMs } from './clock';

export class InMemoryWhisperHistoryStore implements WhisperHistoryStore {
  private readonly decisions: WhisperDecisionRecord[] = [];
  private readonly dismissals: WhisperDismissalRecord[] = [];
  private readonly interactions: WhisperInteractionRecord[] = [];

  constructor(private readonly clock?: WhisperClock) {}

  appendDecision(record: WhisperDecisionRecord): void {
    this.decisions.push({ ...record });
  }

  appendDismissal(record: WhisperDismissalRecord): void {
    this.dismissals.push({ ...record });
  }

  appendInteraction(record: WhisperInteractionRecord): void {
    this.interactions.push({ ...record });
  }

  getSnapshot(): WhisperHistorySnapshot {
    return {
      decisionRecords: this.decisions.map((r) => ({ ...r })),
      dismissalRecords: this.dismissals.map((r) => ({ ...r })),
      interactionRecords: this.interactions.map((r) => ({ ...r })),
      capturedAt: this.clock ? isoFromMs(this.clock.now()) : '',
      ruleVersion: WHISPER_RULE_VERSION,
    };
  }

  get decisionCount(): number {
    return this.decisions.length;
  }
  get dismissalCount(): number {
    return this.dismissals.length;
  }
  get interactionCount(): number {
    return this.interactions.length;
  }
}
