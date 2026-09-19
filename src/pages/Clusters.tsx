import { Badge } from '@/components/Badge';
import { CLUSTERS_PAGE_VIEW } from '@/fixtures/clustering/clusteringBootstrap';

export default function Clusters() {
  const { clusters, unmerged } = CLUSTERS_PAGE_VIEW;

  return (
    <div className="flex flex-col gap-4" data-testid="clusters-page">
      <header>
        <h1 className="text-lg font-mono uppercase tracking-widest text-ink-200">
          Confirmed Clusters
        </h1>
        <p className="text-xs font-mono text-ink-500">
          Deterministic exact-match clustering only · under-merge is safer than over-merge · no
          semantic / suggested clustering (deferred)
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {clusters.map((c) => {
          const disp = c.display;

          const PLACEHOLDER = '—';
          return (
            <article
              key={c.clusterId}
              data-testid={`cluster-${c.clusterId}`}
              data-member-count={disp ? disp.confirmedMemberCount : ''}
              data-source-count={disp ? disp.sourceCount : ''}
              data-cluster-status={c.clusterStatus}
              data-rule-version={disp ? disp.clusterRuleVersion : ''}
              data-correction-count={disp ? disp.correctionCount : c.corrections.length}
              className="border border-ink-700 bg-ink-800 rounded-lg p-3 flex flex-col gap-2"
            >
              <header className="flex flex-wrap items-center gap-2">
                <Badge tone="info">
                  {disp ? disp.label : 'Confirmed deterministic cluster (display unavailable)'}
                </Badge>
                <h2 className="text-sm text-ink-100">{c.clusterTitle}</h2>
                <Badge tone="neutral">
                  members: {disp ? disp.confirmedMemberCount : PLACEHOLDER}
                </Badge>
                <Badge tone="neutral">sources: {disp ? disp.sourceCount : PLACEHOLDER}</Badge>
                <Badge tone={c.clusterStatus === 'corrected' ? 'warn' : 'ok'}>
                  status: {c.clusterStatus}
                </Badge>
                <Badge tone="mute">rule: {disp ? disp.clusterRuleVersion : PLACEHOLDER}</Badge>
              </header>

              <section>
                <h3 className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-1">
                  Confirmed members
                </h3>
                <ul className="flex flex-col gap-0.5">
                  {c.members.map((m) => (
                    <li
                      key={m.itemId}
                      data-testid={`cluster-member-${m.itemId}`}
                      data-reason-type={m.reasonType === 'unknown' ? '' : m.reasonType}
                      className="text-[11px] font-mono text-ink-300"
                    >
                      {m.itemId} · {m.sourceId} · reason: {m.reasonType}
                      {m.evidence ? ` (${m.evidence})` : ''}
                    </li>
                  ))}
                </ul>
              </section>

              {c.corrections.length > 0 && (
                <section>
                  <h3 className="text-[10px] font-mono uppercase tracking-wider text-accent-warn mb-1">
                    Correction history
                  </h3>
                  <ul className="flex flex-col gap-0.5">
                    {c.corrections.map((e) => (
                      <li
                        key={e.membershipEventId}
                        data-testid={`cluster-correction-${e.itemId}`}
                        className="text-[11px] font-mono text-ink-400"
                      >
                        removed {e.itemId} — {e.reasonDetail}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </article>
          );
        })}
      </div>

      <section data-testid="clusters-unmerged">
        <h3 className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-1">
          Kept separate (not merged)
        </h3>
        <ul className="flex flex-col gap-0.5">
          {unmerged.map((i) => (
            <li
              key={i.itemId}
              data-testid={`unmerged-${i.itemId}`}
              className="text-[11px] font-mono text-ink-500"
            >
              {i.itemId} · {i.sourceId} · no exact deterministic match
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
