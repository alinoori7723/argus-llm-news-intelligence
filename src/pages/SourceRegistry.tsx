import { FIXTURE_SOURCES } from '@/fixtures/sources';
import { Badge } from '@/components/Badge';
import { ingestionEligibility, type IngestionEligibility } from '@/domain/ingestion';
import { calendarIngestionEligibility } from '@/domain/calendar';
import { DEV_CALENDAR_SOURCE_LIST } from '@/fixtures/calendar/calendarSources';
import type { SourceProfile } from '@/domain/types';

const isCalendarType = (s: SourceProfile): boolean => s.sourceType === 'economic_calendar_fixture';

const eligibilityFor = (s: SourceProfile): IngestionEligibility =>
  isCalendarType(s) ? calendarIngestionEligibility(s) : ingestionEligibility(s);

const parserSupportFor = (s: SourceProfile): string | null => {
  if (s.sourceType === 'rss_fixture') return 'rss-parser-v1';
  if (s.sourceType === 'economic_calendar_fixture') return 'calendar-parser-v1';
  return null;
};

const legalTone = (l: string): 'ok' | 'warn' | 'alert' =>
  l === 'allowed' ? 'ok' : l === 'needs_review' ? 'warn' : 'alert';

const tierTone = (t: string): 'ok' | 'info' | 'neutral' | 'mute' =>
  t === 'primary' ? 'ok' : t === 'reputable' ? 'info' : t === 'curated' ? 'neutral' : 'mute';

const eligibilityTone = (e: IngestionEligibility): 'ok' | 'warn' | 'alert' | 'mute' =>
  e === 'eligible' ? 'ok' : e === 'quarantined' ? 'warn' : e === 'disabled' ? 'alert' : 'mute';

const eligibilityLabel: Record<IngestionEligibility, string> = {
  eligible: 'ingest: eligible',
  quarantined: 'ingest: quarantined (needs review)',
  disabled: 'ingest: disabled',
  unsupported: 'ingest: unsupported type',
};

export default function SourceRegistry() {
  const rows = [...FIXTURE_SOURCES, ...DEV_CALENDAR_SOURCE_LIST];
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-mono uppercase tracking-widest text-ink-200">
          Source Registry / Settings
        </h1>
        <p className="text-xs font-mono text-ink-500">
          Registry of fixture sources · disabled and needs_review are visibly distinct
        </p>
      </header>
      <div className="grid grid-cols-1 gap-3">
        {rows.map((s) => {
          const isDisabled = s.legalStatus === 'disabled' || !s.enabled;
          const isReview = s.legalStatus === 'needs_review';
          const eligibility = eligibilityFor(s);
          const parserSupport = parserSupportFor(s);
          return (
            <article
              key={s.sourceId}
              data-testid={`source-row-${s.sourceId}`}
              data-legal-status={s.legalStatus}
              data-source-tier={s.sourceTier}
              data-enabled={String(s.enabled)}
              data-ingestion-eligibility={eligibility}
              data-parser-support={parserSupport ?? ''}
              className={[
                'border rounded-lg p-3 bg-ink-800',
                isDisabled
                  ? 'opacity-60 border-accent-alert/40'
                  : isReview
                    ? 'border-accent-warn/50'
                    : 'border-ink-700',
              ].join(' ')}
            >
              <header className="flex flex-wrap items-center gap-2 mb-2">
                <h2 className="text-sm text-ink-100">{s.name}</h2>
                <Badge tone="mute">{s.sourceType}</Badge>
                <Badge tone={legalTone(s.legalStatus)}>legal:{s.legalStatus}</Badge>
                <Badge tone={tierTone(s.sourceTier)}>tier:{s.sourceTier}</Badge>
                <Badge tone={s.enabled ? 'ok' : 'alert'}>
                  {s.enabled ? 'enabled' : 'disabled'}
                </Badge>
                <Badge tone={eligibilityTone(eligibility)} title="ingestion eligibility">
                  {eligibilityLabel[eligibility]}
                </Badge>
                {parserSupport && (
                  <Badge tone="info" title="parser support">
                    parser:{parserSupport}
                  </Badge>
                )}
              </header>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs font-mono text-ink-300">
                <div>
                  <dt className="text-ink-500">accessMethod</dt>
                  <dd>{s.accessMethod}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">freshnessExpectation</dt>
                  <dd>{s.freshnessExpectation}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-ink-500">trustNotes</dt>
                  <dd className="text-ink-200">{s.trustNotes}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">defaultAssetTags</dt>
                  <dd>{s.defaultAssetTags.join(', ') || '—'}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">defaultTopicTags</dt>
                  <dd>{s.defaultTopicTags.join(', ') || '—'}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </div>
  );
}
