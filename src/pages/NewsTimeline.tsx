import { useMemo } from 'react';
import { FIXTURE_SNAPSHOT } from '@/fixtures/snapshot';
import { ingestedItems } from '@/domain/selectors';

const fmt = (iso: string) => new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

export default function NewsTimeline() {
  const items = useMemo(() => ingestedItems(FIXTURE_SNAPSHOT), []);
  const sorted = useMemo(
    () => [...items].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt)),
    [items],
  );

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-mono uppercase tracking-widest text-ink-200">News Timeline</h1>
        <p className="text-xs font-mono text-ink-500">
          Separate timestamps preserved: sourceEventTime · observedAt · ingestedAt
        </p>
      </header>
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-left text-ink-400 border-b border-ink-700">
            <th className="py-2 pr-3" data-col="sourceEventTime">
              sourceEventTime
            </th>
            <th className="py-2 pr-3" data-col="observedAt">
              observedAt
            </th>
            <th className="py-2 pr-3" data-col="ingestedAt">
              ingestedAt
            </th>
            <th className="py-2 pr-3">title</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((it) => (
            <tr
              key={it.itemId}
              className="border-b border-ink-800 hover:bg-ink-800/40"
              data-testid={`timeline-row-${it.itemId}`}
            >
              <td className="py-2 pr-3 text-ink-300" data-field="sourceEventTime">
                {fmt(it.sourceEventTime)}
              </td>
              <td className="py-2 pr-3 text-ink-300" data-field="observedAt">
                {fmt(it.observedAt)}
              </td>
              <td className="py-2 pr-3 text-ink-300" data-field="ingestedAt">
                {fmt(it.ingestedAt)}
              </td>
              <td className="py-2 pr-3 text-ink-100">{it.title}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
