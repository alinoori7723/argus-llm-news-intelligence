import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FIXTURE_SNAPSHOT } from '@/fixtures/snapshot';
import { buildMorningBrief, MAJOR_CLUSTERS_HEADING } from '@/domain/morningBrief';
import { CALENDAR_CLEAN_ACTIVE_UPCOMING_VIEWS } from '@/fixtures/calendar/calendarBootstrap';
import { Badge } from '@/components/Badge';
import { buildCalendarConfirmationDisplay, buildCalendarEvidenceDisplay } from '@/domain/display';

const fmtSched = (iso: string | null) =>
  iso ? iso.replace('T', ' ').slice(0, 16) + ' UTC' : '(unknown)';

export default function MorningBrief() {
  const now = useMemo(() => new Date(FIXTURE_SNAPSHOT.generatedAt), []);
  const brief = useMemo(() => buildMorningBrief(FIXTURE_SNAPSHOT, now), [now]);

  const scheduled = CALENDAR_CLEAN_ACTIVE_UPCOMING_VIEWS;

  return (
    <div className="flex flex-col gap-4" data-testid="morning-brief">
      <header>
        <h1 className="text-lg font-mono uppercase tracking-widest text-ink-200">Morning Brief</h1>
        <p className="text-xs font-mono text-ink-500">{brief.intro}</p>
        <p className="text-[10px] font-mono text-ink-500">generated: {brief.generatedAt}</p>
      </header>
      <div className="flex flex-col gap-5">
        {brief.sections.map((sec) =>
          sec.heading === MAJOR_CLUSTERS_HEADING ? (
            <section
              key={sec.heading}
              data-testid="brief-major-clusters"
              className="flex flex-col gap-2"
            >
              <h2 className="font-mono uppercase tracking-wider text-sm text-ink-300">
                {sec.heading}
              </h2>
              {brief.majorClusters.length === 0 ? (
                <p className="text-xs text-ink-500 italic">no confirmed clusters</p>
              ) : (
                <ul className="flex flex-col gap-1 text-xs text-ink-200">
                  {brief.majorClusters.map((d) => (
                    <li
                      key={d.clusterId}
                      data-testid={`brief-cluster-${d.clusterId}`}
                      data-confirmed-member-count={d.confirmedMemberCount}
                      data-source-count={d.sourceCount}
                      data-rule-version={d.clusterRuleVersion}
                      className="font-mono flex flex-wrap items-center gap-1"
                    >
                      <span>{d.label}:</span>
                      <span>{d.clusterId}</span>
                      <span>
                        · {d.confirmedMemberCount} confirmed members ({d.clusterRuleVersion})
                      </span>
                      <span>· {d.sourceCount} sources</span>
                      <Link to={d.detailHref} className="text-accent-info hover:underline">
                        cluster detail ↗
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section key={sec.heading} className="flex flex-col gap-2">
              <h2 className="font-mono uppercase tracking-wider text-sm text-ink-300">
                {sec.heading}
              </h2>
              {sec.lines.length === 0 ? (
                <p className="text-xs text-ink-500 italic">no items</p>
              ) : (
                <ul className="flex flex-col gap-1 text-xs text-ink-200">
                  {sec.lines.map((line, i) => (
                    <li key={i} className="font-mono">
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ),
        )}

        <section data-testid="brief-scheduled-events" className="flex flex-col gap-2">
          <h2 className="font-mono uppercase tracking-wider text-sm text-ink-300">
            Scheduled Events (economic calendar)
          </h2>
          {scheduled.length === 0 ? (
            <p className="text-xs text-ink-500 italic">no scheduled events</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-xs text-ink-200">
              {scheduled.map((v) => {
                const conf = buildCalendarConfirmationDisplay(v);
                const ev = buildCalendarEvidenceDisplay({
                  sourceUrl: v.current.sourceUrl,
                  sourceEventId: v.current.sourceEventId,
                });
                return (
                  <li
                    key={v.current.revisionId}
                    data-testid={`brief-event-${v.current.sourceEventId}`}
                    data-confirmation-state={conf.confirmationState}
                    data-can-promote={String(conf.canPromoteHighAttention)}
                    className="font-mono flex flex-wrap items-center gap-2"
                  >
                    <span data-field="scheduledFor">{fmtSched(conf.scheduledFor)}</span>
                    <span>· {v.current.eventName}</span>
                    <span data-field="evidence" className="text-ink-500">
                      {ev.referenceType}:{ev.referenceValue}
                    </span>
                    <Badge tone="mute">status:{v.current.revisionStatus}</Badge>
                    <Badge
                      tone={
                        conf.confirmationState === 'fresh'
                          ? 'ok'
                          : conf.confirmationState === 'stale'
                            ? 'alert'
                            : 'warn'
                      }
                    >
                      confirmation:{conf.confirmationState}
                    </Badge>
                    {conf.confirmationCaveat && (
                      <span className="text-accent-warn">⚠ {conf.confirmationCaveat}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
