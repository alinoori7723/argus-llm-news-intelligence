import type { IngestionRun } from '@/domain/ingestion';
import {
  INGESTION_DIAGNOSTICS_VIEW,
  INGESTION_DEMO_CLOCK_INSTANT,
} from '@/fixtures/ingestion/ingestionBootstrap';
import { Badge } from '@/components/Badge';

const DEV_CLOCK_INSTANT = INGESTION_DEMO_CLOCK_INSTANT;

const statusTone = (status: IngestionRun['status']): 'ok' | 'warn' | 'alert' | 'mute' =>
  status === 'success'
    ? 'ok'
    : status === 'partial_success'
      ? 'warn'
      : status === 'skipped'
        ? 'mute'
        : 'alert';

export default function Ingestion() {
  const { runs, rawPayloadCount } = INGESTION_DIAGNOSTICS_VIEW;

  return (
    <div className="flex flex-col gap-4" data-testid="ingestion-diagnostics">
      <header>
        <h1 className="text-lg font-mono uppercase tracking-widest text-ink-200">
          Ingestion Diagnostics
        </h1>
        <p className="text-xs font-mono text-ink-500">
          Recorded-fixture ingestion · deterministic clock {DEV_CLOCK_INSTANT} · no network · sample
          data only
        </p>
        <p className="text-[10px] font-mono text-ink-500">
          legalStatus gates ingestion before fetch — needs_review / disabled sources are skipped
          without any request. Raw payloads stored: {rawPayloadCount}.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3">
        {runs.map((run) => (
          <article
            key={run.ingestionRunId}
            data-testid={`ingestion-run-${run.sourceId}`}
            data-status={run.status}
            data-parser-version={run.parserVersion}
            data-fetcher-version={run.fetcherVersion}
            data-warning-count={run.warnings.length}
            data-malformed-count={run.malformedItemIds.length}
            data-normalized-count={run.normalizedItemIds.length}
            data-skip-reason={run.skipReason ?? ''}
            className="border border-ink-700 bg-ink-800 rounded-lg p-3"
          >
            <header className="flex flex-wrap items-center gap-2 mb-2">
              <h2 className="text-sm text-ink-100 font-mono">{run.sourceId}</h2>
              <Badge tone={statusTone(run.status)}>status: {run.status}</Badge>
              <Badge tone="mute">legal: {run.legalStatusAtRun}</Badge>
              {run.skipReason && <Badge tone="warn">skip: {run.skipReason}</Badge>}
            </header>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs font-mono text-ink-300">
              <div>
                <dt className="text-ink-500">parserVersion</dt>
                <dd data-field="parserVersion">{run.parserVersion}</dd>
              </div>
              <div>
                <dt className="text-ink-500">fetcherVersion</dt>
                <dd>{run.fetcherVersion}</dd>
              </div>
              <div>
                <dt className="text-ink-500">warnings</dt>
                <dd data-field="warningCount">{run.warnings.length}</dd>
              </div>
              <div>
                <dt className="text-ink-500">malformed / quarantined</dt>
                <dd data-field="malformedCount">{run.malformedItemIds.length}</dd>
              </div>
              <div>
                <dt className="text-ink-500">normalized items</dt>
                <dd data-field="normalizedCount">{run.normalizedItemIds.length}</dd>
              </div>
              <div>
                <dt className="text-ink-500">raw payload ref</dt>
                <dd data-field="rawPayloadRef">{run.rawPayloadIds.join(', ') || '—'}</dd>
              </div>
            </dl>
            {run.warnings.length > 0 && (
              <ul className="mt-2 flex flex-col gap-0.5 text-[10px] font-mono text-ink-400">
                {run.warnings.map((w, i) => (
                  <li key={`${run.ingestionRunId}-w-${i}`}>
                    [{w.code}] {w.message}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
