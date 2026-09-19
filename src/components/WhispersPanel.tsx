import { Link } from 'react-router-dom';
import type { WhisperDecisionView, WhisperViewIdentity } from '@/domain/whispers';
import { Badge } from './Badge';

export interface WhispersPanelProps {
  decisions: readonly WhisperDecisionView[];

  heldByDismissal?: readonly WhisperDecisionView[];

  onDismiss?: (identity: WhisperViewIdentity) => void;
  onMarkSeen?: (identity: WhisperViewIdentity) => void;
  onOpenAudit?: (identity: WhisperViewIdentity) => void;
  onOpenEvidence?: (identity: WhisperViewIdentity) => void;
}

type ViewCallbacks = Pick<
  WhispersPanelProps,
  'onDismiss' | 'onMarkSeen' | 'onOpenAudit' | 'onOpenEvidence'
>;

const levelTone = (level: WhisperDecisionView['level']): 'neutral' | 'info' | 'mute' =>
  level === 'whisper' ? 'info' : level === 'glow' ? 'neutral' : 'mute';

const identityOf = (d: WhisperDecisionView): WhisperViewIdentity => ({
  decisionId: d.decisionId,
  targetType: d.targetType,
  targetId: d.targetId,
});

const controlClass =
  'rounded border border-ink-700 bg-ink-900 px-2 py-0.5 text-[10px] font-mono text-ink-300 hover:border-ink-500 hover:text-ink-100';

function DecisionCard({ d, cb }: { d: WhisperDecisionView; cb: ViewCallbacks }) {
  const id = identityOf(d);
  const hasControls = cb.onDismiss || cb.onMarkSeen || cb.onOpenAudit || cb.onOpenEvidence;
  return (
    <article
      data-testid={`whisper-${d.decisionId}`}
      data-level={d.level}
      className="border border-ink-700 bg-ink-800 rounded-lg p-3 flex flex-col gap-1.5"
    >
      <header className="flex flex-wrap items-center gap-2">
        <Badge tone={levelTone(d.level)} title="attention level">
          {d.level}
        </Badge>
        <span className="text-sm text-ink-100">{d.message}</span>
        {d.verificationTier && <Badge tone="mute">verification:{d.verificationTier}</Badge>}
        {d.freshnessState && <Badge tone="mute">freshness:{d.freshnessState}</Badge>}
      </header>

      {d.priorityReason && (
        <p data-field="priority-reason" className="text-[11px] font-mono text-ink-400">
          reason: {d.priorityReason}
        </p>
      )}

      {d.clusterId && (
        <p data-field="cluster" className="text-[11px] font-mono text-ink-400">
          confirmed cluster {d.clusterId} · {d.confirmedMemberCount} members
          {d.clusterRuleVersion ? ` (${d.clusterRuleVersion})` : ''}
        </p>
      )}

      {d.scheduledFor !== undefined && d.scheduledFor !== null && (
        <p data-field="calendar" className="text-[11px] font-mono text-ink-400">
          scheduledFor {d.scheduledFor} · confirmation {d.confirmationState}
        </p>
      )}

      <footer className="flex flex-wrap items-center gap-3 text-[10px] font-mono">
        {d.evidenceRef && (
          <span data-field="evidence" className="text-ink-500">
            {d.evidenceLabel}:{' '}
            {d.evidenceHref ? (
              <a
                href={d.evidenceHref}
                target="_blank"
                rel="noreferrer"
                className="text-accent-info hover:underline"
              >
                {d.evidenceRef}
              </a>
            ) : (
              <span className="text-ink-300">{d.evidenceRef}</span>
            )}
          </span>
        )}
        {d.auditHref && (
          <Link data-field="audit" to={d.auditHref} className="text-accent-info hover:underline">
            {d.auditLabel ?? 'open audit trail'}
          </Link>
        )}
        <span className="ml-auto text-ink-600">{d.ruleVersion}</span>
      </footer>

      {hasControls && (
        <div
          data-testid={`whisper-controls-${d.decisionId}`}
          className="flex flex-wrap items-center gap-2 border-t border-ink-700 pt-1.5"
        >
          {cb.onDismiss && (
            <button
              type="button"
              data-action="dismiss"
              className={controlClass}
              onClick={() => cb.onDismiss!(id)}
            >
              Dismiss
            </button>
          )}
          {cb.onMarkSeen && (
            <button
              type="button"
              data-action="mark-seen"
              className={controlClass}
              onClick={() => cb.onMarkSeen!(id)}
            >
              Mark seen
            </button>
          )}
          {cb.onOpenAudit && d.auditHref && (
            <button
              type="button"
              data-action="open-audit"
              className={controlClass}
              onClick={() => cb.onOpenAudit!(id)}
            >
              Open audit
            </button>
          )}
          {cb.onOpenEvidence && d.evidenceHref && (
            <button
              type="button"
              data-action="open-evidence"
              className={controlClass}
              onClick={() => cb.onOpenEvidence!(id)}
            >
              Open evidence
            </button>
          )}
          <span className="ml-auto text-[10px] font-mono text-ink-600 italic">
            Interaction recorded · visual update deferred until dynamic recompute
          </span>
        </div>
      )}
    </article>
  );
}

export function WhispersPanel({
  decisions,
  heldByDismissal,
  onDismiss,
  onMarkSeen,
  onOpenAudit,
  onOpenEvidence,
}: WhispersPanelProps) {
  const cb: ViewCallbacks = { onDismiss, onMarkSeen, onOpenAudit, onOpenEvidence };
  const attention = decisions.filter((d) => d.level !== 'suppress');
  const suppressed = decisions.filter((d) => d.level === 'suppress');
  const held = heldByDismissal ?? [];

  return (
    <section data-testid="whispers-panel" className="flex flex-col gap-2">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-mono uppercase tracking-widest text-ink-200">Whispers</h2>
        <p className="text-xs font-mono text-ink-500">
          calm, source-backed · {attention.length} active · inspect only
        </p>
      </header>

      <div data-testid="whispers-attention" className="flex flex-col gap-2">
        {attention.length === 0 ? (
          <p className="text-xs font-mono text-ink-500 italic">no active whispers</p>
        ) : (
          attention.map((d) => <DecisionCard key={d.decisionId} d={d} cb={cb} />)
        )}
      </div>

      {held.length > 0 && (
        <details data-testid="whispers-held" className="text-xs font-mono text-ink-500">
          <summary className="cursor-pointer">
            held by dismissal ({held.length}) — quiet window active, not attention
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {held.map((d) => (
              <li key={d.decisionId} data-testid={`whisper-held-${d.decisionId}`}>
                {d.message} · {d.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {suppressed.length > 0 && (
        <details data-testid="whispers-suppressed" className="text-xs font-mono text-ink-500">
          <summary className="cursor-pointer">
            suppressed ({suppressed.length}) — inspection only, not attention
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {suppressed.map((d) => (
              <li key={d.decisionId} data-testid={`whisper-suppressed-${d.decisionId}`}>
                {d.message} · {d.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
