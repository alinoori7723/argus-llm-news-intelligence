import { useMemo } from 'react';
import { FIXTURE_SNAPSHOT } from '@/fixtures/snapshot';
import { computeWorldRegions, ingestedItems } from '@/domain/selectors';
import { Badge } from '@/components/Badge';

export default function WorldRadar() {
  const regions = useMemo(() => computeWorldRegions(FIXTURE_SNAPSHOT), []);
  const items = useMemo(() => ingestedItems(FIXTURE_SNAPSHOT), []);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-mono uppercase tracking-widest text-ink-200">World Radar</h1>
        <p className="text-xs font-mono text-ink-500">
          Source-backed item and source counts grouped by region — NOT confirmed cluster counts.
          Counts only, no price predictions. See Clusters for confirmed deterministic clusters.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {regions.map((region) => (
          <section
            key={region.key}
            data-testid={`world-region-${region.key}`}
            className="border border-ink-700 bg-ink-800 rounded-lg p-3"
          >
            <header className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-mono uppercase tracking-wider text-ink-200">
                {region.title}
              </h2>
              <div className="flex gap-1.5">
                <Badge tone="info">{region.itemIds.length} items</Badge>
                <Badge tone="neutral">{region.sourceCount} sources</Badge>
              </div>
            </header>
            <ul className="flex flex-col gap-1 text-xs text-ink-300 font-mono">
              {region.itemIds.length === 0 && (
                <li className="text-ink-500 italic">no source-backed items</li>
              )}
              {region.itemIds.slice(0, 6).map((id) => {
                const it = items.find((i) => i.itemId === id);
                if (!it) return null;
                return (
                  <li key={id} className="truncate">
                    [{it.verificationTier}] {it.title}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
