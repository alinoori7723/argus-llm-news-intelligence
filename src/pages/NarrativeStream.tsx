import { useMemo } from 'react';
import { FIXTURE_SNAPSHOT } from '@/fixtures/snapshot';
import { annotateItems } from '@/domain/selectors';
import { StreamRow } from '@/components/StreamRow';

export default function NarrativeStream() {
  const now = useMemo(() => new Date(FIXTURE_SNAPSHOT.generatedAt), []);
  const annotated = useMemo(() => annotateItems(FIXTURE_SNAPSHOT, now), [now]);

  const order = ['P0', 'P1', 'P2', 'P3', 'muted'];
  const sorted = [...annotated].sort((a, b) => {
    const pa = order.indexOf(a.priority.priorityTier);
    const pb = order.indexOf(b.priority.priorityTier);
    if (pa !== pb) return pa - pb;
    return Date.parse(b.item.observedAt) - Date.parse(a.item.observedAt);
  });

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-mono uppercase tracking-widest text-ink-200">
          Narrative Stream
        </h1>
        <p className="text-xs font-mono text-ink-500">
          Splunk-like source-backed feed · deterministic ordering
        </p>
      </header>
      <div className="flex flex-col gap-2">
        {sorted.map((ai) => (
          <StreamRow key={ai.item.itemId} ai={ai} now={now} />
        ))}
      </div>
    </div>
  );
}
