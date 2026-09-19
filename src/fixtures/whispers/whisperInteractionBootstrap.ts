import {
  PersistenceBackedWhisperHistoryStore,
  fixedWhisperClock,
  recordWhisperInteraction,
  type WhisperInteractionResult,
  type WhisperInteractionType,
  type WhisperViewIdentity,
} from '@/domain/whispers';
import { InMemoryAppendOnlyPersistenceStore } from '@/domain/persistence';
import { DEMO_VIEW_INSTANT } from '@/fixtures/calendar/demoCalendar';

export const whisperInteractionStore = new PersistenceBackedWhisperHistoryStore(
  new InMemoryAppendOnlyPersistenceStore(),
);

const interactionClock = fixedWhisperClock(Date.parse(DEMO_VIEW_INSTANT));

let intentCounter = 0;

export const dispatchWhisperInteraction = (
  identity: WhisperViewIdentity,
  interactionType: WhisperInteractionType,
): WhisperInteractionResult => {
  intentCounter += 1;
  return recordWhisperInteraction({
    intent: {
      intentId: `ui-${interactionType}-${identity.targetId}-${intentCounter}`,
      interactionType,
      targetType: identity.targetType,
      targetId: identity.targetId,
      decisionId: identity.decisionId,
    },
    clock: interactionClock,
    historyStore: whisperInteractionStore,
  });
};
