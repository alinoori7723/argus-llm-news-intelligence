import type { CalendarEventView } from '@/domain/calendar';
import { Badge } from '@/components/Badge';
import {
  CALENDAR_DEMO_VIEW_INSTANT,
  CALENDAR_RICH_EVENT_VIEWS,
} from '@/fixtures/calendar/calendarBootstrap';
import type { ConfirmationState, RevisionStatus } from '@/domain/calendar';
import { buildCalendarConfirmationDisplay, buildCalendarEvidenceDisplay } from '@/domain/display';

const statusTone = (s: RevisionStatus): 'ok' | 'info' | 'warn' | 'alert' | 'mute' =>
  s === 'active'
    ? 'ok'
    : s === 'completed'
      ? 'info'
      : s === 'cancelled'
        ? 'alert'
        : s === 'postponed'
          ? 'warn'
          : 'mute';

const confirmTone = (s: ConfirmationState): 'ok' | 'warn' | 'alert' | 'mute' =>
  s === 'fresh' ? 'ok' : s === 'aging' ? 'warn' : s === 'stale' ? 'alert' : 'mute';

const fmt = (iso: string | null): string =>
  iso ? iso.replace('T', ' ').slice(0, 16) + ' UTC' : '(unknown)';

function EventCard({ view }: { view: CalendarEventView }) {
  const r = view.current;
  const conf = buildCalendarConfirmationDisplay(view);
  const evidence = buildCalendarEvidenceDisplay({
    sourceUrl: r.sourceUrl,
    sourceEventId: r.sourceEventId,
  });
  const caveat = conf.confirmationCaveat ?? null;
  return (
    <article
      data-testid={`calendar-event-${r.sourceEventId}`}
      data-revision-status={r.revisionStatus}
      data-confirmation-state={view.confirmationState}
      data-change-reason={r.changeReason}
      data-promotable={String(view.promotion.eligible)}
      className="border border-ink-700 bg-ink-800 rounded-lg p-3 flex flex-col gap-2"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm text-ink-100">
          {r.eventName}
          {r.country ? ` · ${r.country}` : ''}
          {r.currency ? ` (${r.currency})` : ''}
        </h2>
        <Badge tone="mute">importance: {r.importanceTier}</Badge>
        <Badge tone={statusTone(r.revisionStatus)}>status: {r.revisionStatus}</Badge>
        <Badge tone={confirmTone(view.confirmationState)}>
          confirmation: {view.confirmationState}
        </Badge>
        <Badge tone="neutral">change: {r.changeReason}</Badge>
      </header>

      {caveat && (
        <p data-field="confirmation-caveat" className="text-[11px] font-mono text-accent-warn">
          ⚠ {caveat}
        </p>
      )}

      <dl className="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs font-mono text-ink-300">
        <div>
          <dt className="text-ink-500">scheduledFor</dt>
          <dd data-field="scheduledFor">{fmt(r.scheduledFor)}</dd>
        </div>
        <div>
          <dt className="text-ink-500">lastConfirmedAt</dt>
          <dd data-field="lastConfirmedAt">{fmt(view.effectiveLastConfirmedAt)}</dd>
        </div>
        <div>
          <dt className="text-ink-500">observedAt</dt>
          <dd data-field="observedAt">{fmt(r.observedAt)}</dd>
        </div>
        <div>
          <dt className="text-ink-500">ingestedAt</dt>
          <dd data-field="ingestedAt">{fmt(r.ingestedAt)}</dd>
        </div>
        <div>
          <dt className="text-ink-500">normalizedAt</dt>
          <dd data-field="normalizedAt">{fmt(r.normalizedAt)}</dd>
        </div>
        <div>
          <dt className="text-ink-500">{evidence.label.toLowerCase()}</dt>
          <dd data-field="evidence" data-evidence-kind={evidence.referenceType}>
            {evidence.isExternal && evidence.href ? (
              <a
                href={evidence.href}
                target="_blank"
                rel="noreferrer"
                className="text-accent-info hover:underline"
              >
                {evidence.referenceValue}
              </a>
            ) : (
              `${evidence.referenceType}: ${evidence.referenceValue}`
            )}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500">parser / processing</dt>
          <dd data-field="versions">
            {r.parserVersion} / {r.processingVersion}
          </dd>
        </div>
      </dl>

      <section>
        <h3 className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-1">
          Revision history ({view.history.length})
        </h3>
        <ul data-testid={`calendar-history-${r.sourceEventId}`} className="flex flex-col gap-0.5">
          {view.history.map((rev) => (
            <li
              key={rev.revisionId}
              data-revision-number={rev.revisionNumber}
              data-revision-status={rev.revisionStatus}
              data-change-reason={rev.changeReason}
              className="text-[11px] font-mono text-ink-300"
            >
              #{rev.revisionNumber} · {rev.revisionStatus} · {rev.changeReason} ·{' '}
              {fmt(rev.scheduledFor)}
              {rev.supersededByRevisionId ? ' · superseded' : ''}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

export default function Calendar() {
  const views = CALENDAR_RICH_EVENT_VIEWS;

  return (
    <div className="flex flex-col gap-4" data-testid="calendar-page">
      <header>
        <h1 className="text-lg font-mono uppercase tracking-widest text-ink-200">
          Economic Calendar
        </h1>
        <p className="text-xs font-mono text-ink-500">
          Version-aware recorded fixture · view instant {CALENDAR_DEMO_VIEW_INSTANT} · sample data
          only · scheduled events are future assertions, not facts
        </p>
      </header>
      <div className="grid grid-cols-1 gap-3">
        {views.map((v) => (
          <EventCard key={v.current.revisionId} view={v} />
        ))}
      </div>
    </div>
  );
}
