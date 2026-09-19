import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FIXTURE_SNAPSHOT } from '@/fixtures/snapshot';
import { annotateItems, computePulseCells, type PulseKey } from '@/domain/selectors';
import { PulseGrid } from '@/components/PulseGrid';
import { StreamRow } from '@/components/StreamRow';
import { WhispersPanel } from '@/components/WhispersPanel';
import { scheduledSummaryLine } from '@/domain/calendar';
import { buildAuditLinkDisplay } from '@/domain/display';
import { CALENDAR_CLEAN_PROMOTABLE_VIEWS } from '@/fixtures/calendar/calendarBootstrap';

import { useWhisperSession } from '@/fixtures/whispers/whisperSessionBootstrap';

export default function Dashboard() {
  const now = useMemo(() => new Date(FIXTURE_SNAPSHOT.generatedAt), []);
  const cells = useMemo(() => computePulseCells(FIXTURE_SNAPSHOT, now), [now]);
  const annotated = useMemo(() => annotateItems(FIXTURE_SNAPSHOT, now), [now]);

  const scheduled = CALENDAR_CLEAN_PROMOTABLE_VIEWS;

  const [selected, setSelected] = useState<PulseKey | undefined>(undefined);

  const whispers = useWhisperSession();

  const matchingItemIds = useMemo(() => {
    if (!selected) return null;
    const cell = cells.find((c) => c.key === selected);
    return cell ? new Set(cell.matchingItemIds) : null;
  }, [selected, cells]);

  const filtered = matchingItemIds
    ? annotated.filter((a) => matchingItemIds.has(a.item.itemId))
    : annotated;

  const sorted = [...filtered].sort((a, b) => {
    const order = ['P0', 'P1', 'P2', 'P3', 'muted'];
    const pa = order.indexOf(a.priority.priorityTier);
    const pb = order.indexOf(b.priority.priorityTier);
    if (pa !== pb) return pa - pb;
    return Date.parse(b.item.observedAt) - Date.parse(a.item.observedAt);
  });

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="pulse-heading" className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between">
          <h1
            id="pulse-heading"
            className="text-lg font-mono uppercase tracking-widest text-ink-200"
          >
            Argus Pulse
          </h1>
          <p className="text-xs font-mono text-ink-500">
            source-backed cells · click to filter the stream
          </p>
        </header>
        <PulseGrid cells={cells} selected={selected} onSelect={setSelected} />
        {selected && (
          <button
            type="button"
            onClick={() => setSelected(undefined)}
            className="self-start text-xs font-mono text-ink-400 hover:text-ink-100"
          >
            clear filter
          </button>
        )}
        <div data-testid="pulse-scheduled" className="flex flex-col gap-1">
          <div className="text-[10px] font-mono uppercase tracking-widest text-ink-500">
            Scheduled (economic calendar) · confirmed only
          </div>
          {scheduled.length === 0 ? (
            <p className="text-xs font-mono text-ink-500 italic">
              no confirmed upcoming scheduled events
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {scheduled.map((v) => {
                const audit = buildAuditLinkDisplay('calendar_event', v.current.sourceEventId);
                return (
                  <li
                    key={v.current.revisionId}
                    data-testid={`pulse-scheduled-${v.current.sourceEventId}`}
                    className="text-xs font-mono text-ink-200 flex items-center gap-2"
                  >
                    <span>News: {scheduledSummaryLine(v)}</span>
                    <Link to={audit.href} className="text-accent-info hover:underline">
                      {audit.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <WhispersPanel
        decisions={[
          ...whispers.session.activeDecisions,
          ...whispers.session.inspectionOnlyDecisions,
        ]}
        heldByDismissal={whispers.session.heldByInteraction}
        onDismiss={whispers.onDismiss}
        onMarkSeen={whispers.onMarkSeen}
        onOpenAudit={whispers.onOpenAudit}
        onOpenEvidence={whispers.onOpenEvidence}
      />

      <section aria-labelledby="stream-heading" className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between">
          <h2
            id="stream-heading"
            className="text-lg font-mono uppercase tracking-widest text-ink-200"
          >
            Narrative Stream
          </h2>
          <p className="text-xs font-mono text-ink-500">
            {sorted.length} items · deterministic priority
          </p>
        </header>
        <div className="flex flex-col gap-2" data-testid="dashboard-stream">
          {sorted.map((ai) => (
            <StreamRow key={ai.item.itemId} ai={ai} now={now} />
          ))}
        </div>
      </section>
    </div>
  );
}
