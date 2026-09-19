import { useState } from 'react';
import {
  PersistenceBackedWhisperHistoryStore,
  fixedWhisperClock,
  projectWhisperSessionView,
  recordWhisperInteraction,
  type WhisperClock,
  type WhisperDecisionView,
  type WhisperHistoryStore,
  type WhisperInteractionType,
  type WhisperSessionView,
  type WhisperViewIdentity,
} from '@/domain/whispers';
import { InMemoryAppendOnlyPersistenceStore } from '@/domain/persistence';
import { DEMO_VIEW_INSTANT } from '@/fixtures/calendar/demoCalendar';
import { WHISPER_DECISION_VIEWS } from './whisperBootstrap';

export interface WhisperSessionController {
  getSessionView(): WhisperSessionView;
  dismiss(identity: WhisperViewIdentity): WhisperSessionView;
  markSeen(identity: WhisperViewIdentity): WhisperSessionView;
  openAudit(identity: WhisperViewIdentity): WhisperSessionView;
  openEvidence(identity: WhisperViewIdentity): WhisperSessionView;
}

export interface CreateWhisperSessionControllerInput {
  baseViews: readonly WhisperDecisionView[];
  historyStore: WhisperHistoryStore;
  clock: WhisperClock;
}

export const createWhisperSessionController = ({
  baseViews,
  historyStore,
  clock,
}: CreateWhisperSessionControllerInput): WhisperSessionController => {
  let intentCounter = 0;

  const recompute = (): WhisperSessionView =>
    projectWhisperSessionView({
      decisions: baseViews,
      historySnapshot: historyStore.getSnapshot(),
      clock,
    });

  const act = (
    identity: WhisperViewIdentity,
    interactionType: WhisperInteractionType,
  ): WhisperSessionView => {
    intentCounter += 1;
    recordWhisperInteraction({
      intent: {
        intentId: `ui-${interactionType}-${identity.targetId}-${intentCounter}`,
        interactionType,
        targetType: identity.targetType,
        targetId: identity.targetId,
        decisionId: identity.decisionId,
      },
      clock,
      historyStore,
    });
    return recompute();
  };

  return {
    getSessionView: () => recompute(),
    dismiss: (identity) => act(identity, 'dismiss'),
    markSeen: (identity) => act(identity, 'mark_seen'),
    openAudit: (identity) => act(identity, 'open_audit'),
    openEvidence: (identity) => act(identity, 'open_evidence'),
  };
};

export const whisperSessionStore = new PersistenceBackedWhisperHistoryStore(
  new InMemoryAppendOnlyPersistenceStore(),
);
const sessionClock = fixedWhisperClock(Date.parse(DEMO_VIEW_INSTANT));
export const whisperSessionController = createWhisperSessionController({
  baseViews: WHISPER_DECISION_VIEWS,
  historyStore: whisperSessionStore,
  clock: sessionClock,
});

export interface UseWhisperSession {
  session: WhisperSessionView;
  onDismiss: (identity: WhisperViewIdentity) => void;
  onMarkSeen: (identity: WhisperViewIdentity) => void;
  onOpenAudit: (identity: WhisperViewIdentity) => void;
  onOpenEvidence: (identity: WhisperViewIdentity) => void;
}

export function useWhisperSession(
  controller: WhisperSessionController = whisperSessionController,
): UseWhisperSession {
  const [session, setSession] = useState<WhisperSessionView>(() => controller.getSessionView());
  return {
    session,
    onDismiss: (identity) => setSession(controller.dismiss(identity)),
    onMarkSeen: (identity) => setSession(controller.markSeen(identity)),
    onOpenAudit: (identity) => setSession(controller.openAudit(identity)),
    onOpenEvidence: (identity) => setSession(controller.openEvidence(identity)),
  };
}
