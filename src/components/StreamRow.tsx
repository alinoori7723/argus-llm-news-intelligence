import { Link } from 'react-router-dom';
import type { AnnotatedItem } from '@/domain/selectors';
import { Badge } from './Badge';
import { ageLabel } from '@/domain/format';
import {
  buildItemDisplay,
  type CautionLevel,
  type FreshnessDisplay,
  type PriorityDisplay,
} from '@/domain/display';

export interface StreamRowProps {
  ai: AnnotatedItem;

  now: Date;
}

const cautionTone = (c: CautionLevel): 'ok' | 'info' | 'warn' | 'alert' =>
  c === 'none' ? 'ok' : c === 'low' ? 'info' : c === 'medium' ? 'warn' : 'alert';

const priorityTone = (p: PriorityDisplay['priorityTier']) =>
  p === 'P0' ? 'alert' : p === 'P1' ? 'warn' : p === 'P2' ? 'info' : p === 'P3' ? 'mute' : 'mute';

const freshnessTone = (f: FreshnessDisplay['freshnessState']) =>
  f === 'live'
    ? 'ok'
    : f === 'delayed'
      ? 'warn'
      : f === 'stale'
        ? 'mute'
        : f === 'disconnected'
          ? 'alert'
          : 'mute';

export function StreamRow({ ai, now }: StreamRowProps) {
  const { item, source } = ai;
  const display = buildItemDisplay(ai);
  const { evidence, verification, freshness, priority, cluster, auditLink } = display;
  const sourceTags = item.tags.filter(
    (t) => t.provenance === 'deterministic' || t.provenance === 'user_confirmed',
  );
  const isUnverified = !verification.mayPromoteHighAttention;
  return (
    <article
      data-testid={`stream-row-${item.itemId}`}
      data-item-id={item.itemId}
      data-verification={verification.verificationTier}
      data-evidence-kind={evidence.referenceType}
      data-evidence-value={evidence.referenceValue}
      data-priority-reason={priority.priorityReason}
      data-confirmed-member-count={cluster?.confirmedMemberCount ?? 1}
      className={[
        'rounded border bg-ink-800 p-3 flex flex-col gap-2',
        isUnverified ? 'border-accent-warn/60' : 'border-ink-700',
      ].join(' ')}
    >
      <header className="flex items-center gap-2 flex-wrap text-xs font-mono text-ink-400">
        <time dateTime={item.observedAt} className="text-ink-200">
          {new Date(item.observedAt).toISOString().replace('T', ' ').slice(0, 16)}
        </time>
        <span aria-hidden>·</span>
        <span>{source.name}</span>
        <Badge tone="mute" title="source type">
          {source.sourceType}
        </Badge>
        <Badge tone={cautionTone(verification.cautionLevel)} title="verification">
          {verification.visualLabel}
        </Badge>
        <Badge tone={priorityTone(priority.priorityTier)} title={priority.priorityReason}>
          {priority.priorityTier}
        </Badge>
        <Badge
          tone={freshnessTone(freshness.freshnessState)}
          title={freshness.caveat ?? 'freshness'}
        >
          {freshness.freshnessState}
        </Badge>
        <span className="ml-auto text-ink-500">{ageLabel(item.observedAt, now)}</span>
      </header>
      <div className="text-sm text-ink-100">
        <Link
          to={`/newsroom/${item.itemId}`}
          className="hover:underline underline-offset-2 decoration-ink-500"
        >
          {item.title}
        </Link>
      </div>
      <p className="text-xs text-ink-400">{item.excerpt}</p>
      <div
        data-testid={`stream-row-evidence-${item.itemId}`}
        data-evidence-kind={evidence.referenceType}
        className="text-[10px] font-mono text-ink-400"
        aria-label="evidence reference"
      >
        evidence ({evidence.referenceType}):{' '}
        {evidence.isExternal && evidence.href ? (
          <a
            href={evidence.href}
            target="_blank"
            rel="noreferrer"
            className="text-accent-info underline-offset-2 hover:underline"
          >
            {evidence.referenceValue}
          </a>
        ) : (
          <span className="text-ink-300">{evidence.referenceValue}</span>
        )}
      </div>
      <p
        data-field="priority-reason"
        className="text-[10px] font-mono text-ink-500 truncate"
        title={priority.priorityReason}
      >
        priority {priority.priorityTier} · {priority.priorityReason}
      </p>
      <footer className="flex flex-wrap items-center gap-1.5">
        {sourceTags.map((t) => (
          <Badge key={t.tagId} tone="neutral">
            {t.tagType}:{t.tagValue}
          </Badge>
        ))}
        {cluster && (
          <Badge tone="info" title={cluster.label}>
            confirmed cluster · {cluster.confirmedMemberCount} members
          </Badge>
        )}
        <Link
          to={auditLink.href}
          className="ml-auto text-[10px] font-mono text-accent-info hover:underline"
        >
          {auditLink.label}
        </Link>
      </footer>
    </article>
  );
}
