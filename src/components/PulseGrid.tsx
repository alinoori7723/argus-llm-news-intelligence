import type { PulseCell } from '@/domain/selectors';

export interface PulseGridProps {
  cells: PulseCell[];
  onSelect?: (key: PulseCell['key']) => void;
  selected?: PulseCell['key'];
}

export function PulseGrid({ cells, onSelect, selected }: PulseGridProps) {
  return (
    <section
      aria-label="Argus Pulse"
      data-testid="pulse-grid"
      className="grid grid-cols-2 md:grid-cols-3 gap-3"
    >
      {cells.map((cell) => {
        const isSelected = selected === cell.key;
        return (
          <button
            type="button"
            key={cell.key}
            data-testid={`pulse-cell-${cell.key}`}
            data-pulse-key={cell.key}
            data-pulse-count={cell.count}
            onClick={() => onSelect?.(cell.key)}
            className={[
              'text-left border rounded-lg p-3 transition',
              'bg-ink-800 border-ink-700 hover:border-ink-500',
              isSelected ? 'ring-2 ring-accent-info border-accent-info' : '',
            ].join(' ')}
          >
            <div className="flex items-center justify-between">
              <div className="font-mono text-xs uppercase tracking-widest text-ink-400">
                {cell.label}
              </div>
              <div className="text-[10px] font-mono text-ink-500">{cell.count} headlines</div>
            </div>
            <div className="mt-2 text-sm text-ink-100" data-testid={`pulse-summary-${cell.key}`}>
              {cell.summary}
            </div>
          </button>
        );
      })}
    </section>
  );
}
