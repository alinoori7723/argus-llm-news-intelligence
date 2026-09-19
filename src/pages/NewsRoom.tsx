import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FIXTURE_SNAPSHOT } from '@/fixtures/snapshot';
import { annotateItems, ingestedItems, type AnnotatedItem } from '@/domain/selectors';
import { Badge } from '@/components/Badge';
import { formatTimestamp } from '@/domain/format';
import { buildItemDisplay } from '@/domain/display';

function ItemDetail({ ai }: { ai: AnnotatedItem }) {
  const { item, source, priority } = ai;
  const display = buildItemDisplay(ai);

  const provenanceTone = (p: string): 'ok' | 'warn' | 'mute' =>
    p === 'deterministic' ? 'ok' : p === 'user_confirmed' ? 'mute' : 'warn';

  return (
    <article
      data-testid="newsroom-item"
      data-item-id={item.itemId}
      className="border border-ink-700 bg-ink-800 rounded-lg p-4 flex flex-col gap-3"
    >
      <header className="flex flex-col gap-2">
        <h2 className="text-base text-ink-100">{item.title}</h2>
        <p className="text-sm text-ink-300">{item.excerpt}</p>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="info">verification:{display.verification.visualLabel}</Badge>
          <Badge tone="warn">priority:{display.priority.priorityTier}</Badge>
          <Badge tone="neutral">urgency:{display.priority.urgencyLabel}</Badge>
          <Badge tone="mute">freshness:{display.freshness.freshnessState}</Badge>
          {display.freshness.caveat && (
            <Badge tone="warn" title="freshness caveat">
              ⚠ {display.freshness.caveat}
            </Badge>
          )}
        </div>
      </header>

      <section>
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-400 mb-1">Source</h3>
        <ul className="text-xs text-ink-200 font-mono">
          <li>name: {source.name}</li>
          <li>type: {source.sourceType}</li>
          <li>tier: {source.sourceTier}</li>
          <li>legalStatus: {source.legalStatus}</li>
          <li>enabled: {String(source.enabled)}</li>
          <li>freshnessExpectation: {source.freshnessExpectation}</li>
          <li>trustNotes: {source.trustNotes}</li>
        </ul>
      </section>

      <section data-testid="newsroom-reference">
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-400 mb-1">Reference</h3>
        <ul className="text-xs text-ink-200 font-mono">
          <li data-field="itemId">itemId: {item.itemId}</li>
          <li data-field="sourceItemId">sourceItemId: {item.sourceItemId}</li>
          <li data-field="sourceId">sourceId: {item.sourceId}</li>
          {item.clusterId && <li data-field="clusterId">clusterId: {item.clusterId}</li>}
          <li data-field="verificationTier">verificationTier: {item.verificationTier}</li>
          {item.url ? (
            <li data-field="url">
              url:{' '}
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="text-accent-info underline-offset-2 hover:underline"
              >
                {item.url}
              </a>
            </li>
          ) : (
            <li data-field="url-absent" className="text-ink-500">
              url: (not provided — use sourceItemId / itemId)
            </li>
          )}
        </ul>
      </section>

      <section>
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-400 mb-1">Timestamps</h3>
        <ul className="text-xs text-ink-200 font-mono">
          <li data-field="sourceEventTime">
            sourceEventTime: {formatTimestamp(item.sourceEventTime)}
          </li>
          <li data-field="observedAt">observedAt: {formatTimestamp(item.observedAt)}</li>
          <li data-field="ingestedAt">ingestedAt: {formatTimestamp(item.ingestedAt)}</li>
        </ul>
      </section>

      <section>
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-400 mb-1">
          Priority reason
        </h3>
        <p data-field="priorityReason" className="text-xs text-ink-200 font-mono">
          {priority.priorityReason}
        </p>
      </section>

      <section data-testid="newsroom-confirmed-cluster">
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-400 mb-1">
          Confirmed cluster
        </h3>
        {display.cluster ? (
          <p className="text-xs text-ink-200 font-mono" data-field="confirmedCluster">
            {display.cluster.clusterId} · {display.cluster.confirmedMemberCount} confirmed members (
            {display.cluster.clusterRuleVersion}) · {display.cluster.sourceCount} sources ·{' '}
            <Link to={display.cluster.detailHref} className="text-accent-info hover:underline">
              cluster detail ↗
            </Link>
          </p>
        ) : (
          <p className="text-xs text-ink-200 font-mono" data-field="confirmedCluster">
            not in a confirmed cluster
          </p>
        )}
      </section>

      <section>
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-400 mb-1">Tags</h3>
        <div className="flex flex-wrap gap-1.5">
          {item.tags.map((t) => (
            <Badge
              key={t.tagId}
              tone={provenanceTone(t.provenance)}
              title={`provenance: ${t.provenance}`}
            >
              {t.tagType}:{t.tagValue} · {t.provenance}
            </Badge>
          ))}
        </div>
      </section>

      {item.url && (
        <section>
          <h3 className="text-xs font-mono uppercase tracking-wider text-ink-400 mb-1">Evidence</h3>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent-info font-mono underline-offset-2 hover:underline"
          >
            {item.url}
          </a>
        </section>
      )}
    </article>
  );
}

export default function NewsRoom() {
  const { itemId } = useParams();
  const now = useMemo(() => new Date(FIXTURE_SNAPSHOT.generatedAt), []);
  const annotated = useMemo(() => annotateItems(FIXTURE_SNAPSHOT, now), [now]);
  const items = useMemo(() => ingestedItems(FIXTURE_SNAPSHOT), []);

  const selected = itemId ? annotated.find((a) => a.item.itemId === itemId) : annotated[0];

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
      <aside className="border border-ink-700 rounded-lg bg-ink-800 max-h-[70vh] overflow-y-auto">
        <header className="px-3 py-2 border-b border-ink-700">
          <h1 className="text-sm font-mono uppercase tracking-widest text-ink-200">News Room</h1>
          <p className="text-[10px] font-mono text-ink-500">inspect any source item</p>
        </header>
        <ul>
          {items.map((it) => (
            <li key={it.itemId}>
              <Link
                to={`/newsroom/${it.itemId}`}
                className={[
                  'block px-3 py-2 text-xs font-mono border-b border-ink-700',
                  selected?.item.itemId === it.itemId
                    ? 'bg-ink-700/60 text-ink-50'
                    : 'text-ink-300 hover:bg-ink-700/30',
                ].join(' ')}
              >
                <div className="truncate">{it.title}</div>
                <div className="text-ink-500 text-[10px]">
                  {it.verificationTier} · {it.freshnessState}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <div>{selected ? <ItemDetail ai={selected} /> : <p>No item selected.</p>}</div>
    </div>
  );
}
