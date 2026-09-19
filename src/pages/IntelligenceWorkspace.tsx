import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { EvidenceItem, Generation, RunArtifact } from '../../pipeline/contracts';
import demo from '../fixtures/intelligence/demo-run.json';
import '../styles/intelligence.css';

const run = demo as RunArtifact;
const accepted = run.generations.filter((generation) => generation.status === 'accepted');
const sourceName = (id: string) =>
  run.snapshot.dataset.sources.find((source) => source.id === id)?.name ?? id;
const short = (value: string) => `${value.slice(0, 12)}…${value.slice(-6)}`;
const time = (value: string) =>
  new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
const duration = (value: number) => `${value.toFixed(2)} ms`;
const repository = 'https://github.com/alinoori7723/argus-llm-news-intelligence';

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    source: (
      <>
        <path d="M4 4h6l2 3h8v13H4z" />
        <path d="M8 12h8M8 16h5" />
      </>
    ),
    audit: (
      <>
        <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h4" />
      </>
    ),
    pulse: <path d="M2 12h5l3-8 4 16 3-8h5" />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    external: (
      <>
        <path d="M14 3h7v7M21 3l-12 12M10 5H4v15h15v-6" />
      </>
    ),
    check: <path d="m5 12 4 4 10-10" />,
    code: (
      <>
        <path d="m8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.grid}
    </svg>
  );
}

function Status({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span className={`intel-status ${muted ? 'is-muted' : ''}`}>
      <span />
      {children}
    </span>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="intel-field">
      <dt>{label}</dt>
      <dd className={mono ? 'intel-mono' : ''}>{value}</dd>
    </div>
  );
}

function EvidencePanel({ item, onClose }: { item: EvidenceItem; onClose: () => void }) {
  const raw = run.snapshot.rawPayloads.find((payload) => payload.id === item.rawPayloadId)!;
  return (
    <section className="intel-evidence" aria-label="Source evidence">
      <div className="intel-section-heading">
        <div>
          <span className="intel-eyebrow">SOURCE RECORD</span>
          <h2>{sourceName(item.sourceId)}</h2>
        </div>
        <button className="intel-text-button" onClick={onClose}>
          Close ×
        </button>
      </div>
      <h3>{item.title}</h3>
      <blockquote>{item.text}</blockquote>
      <dl>
        <Field label="Source item" value={item.itemId} mono />
        <Field label="Published" value={item.sourceEventTime ?? 'Unknown — withheld'} />
        <Field label="Observed" value={item.observedAt} />
        <Field label="Content SHA-256" value={item.contentHash} mono />
        <Field label="Raw payload SHA-256" value={item.rawPayloadHash} mono />
      </dl>
      <details>
        <summary>Inspect raw RSS payload</summary>
        <pre>{raw.text}</pre>
      </details>
      <p className="intel-fine">Fictional source · reserved .example URL · {item.url}</p>
    </section>
  );
}

function SummaryCard({
  generation,
  onEvidence,
}: {
  generation: Generation;
  onEvidence: (item: EvidenceItem) => void;
}) {
  const cluster = run.snapshot.clusters.find((cluster) => cluster.id === generation.clusterId)!;
  return (
    <article className="intel-summary-card">
      <div className="intel-summary-top">
        <span className="intel-category">{cluster.category}</span>
        <Status>Validated</Status>
      </div>
      <h3>{generation.output!.headline}</h3>
      <div className="intel-claims">
        {generation.output!.claims.map((claim, index) => (
          <p key={index}>
            {claim.text}
            {claim.evidence.map((citation, citationIndex) => {
              const item = run.snapshot.items.find((item) => item.itemId === citation.itemId)!;
              return (
                <button
                  key={citationIndex}
                  className="intel-citation"
                  aria-label={`Inspect evidence ${index + 1} for ${generation.output!.headline}`}
                  onClick={() => onEvidence(item)}
                >
                  {index + 1}
                  <Icon name="external" size={10} />
                </button>
              );
            })}
          </p>
        ))}
      </div>
      <div className="intel-summary-bottom">
        <div className="intel-source-stack">
          {cluster.sourceIds.map((id, index) => (
            <span title={sourceName(id)} key={id} style={{ zIndex: 5 - index }}>
              {sourceName(id).slice(0, 1)}
            </span>
          ))}
          <small>
            {cluster.sourceIds.length} source{cluster.sourceIds.length > 1 ? 's' : ''} ·{' '}
            {cluster.itemIds.length} records
          </small>
        </div>
        <Link to={`/audit?generation=${generation.id}`}>
          Inspect generation <Icon name="arrow" size={14} />
        </Link>
      </div>
    </article>
  );
}

function Overview({ onEvidence }: { onEvidence: (item: EvidenceItem) => void }) {
  const counts = run.snapshot.counts;
  const metrics = [
    ['Source records', counts.input, 'Controlled sample dataset', 'source'],
    ['Duplicates resolved', counts.duplicates, 'Exact identity rules', 'grid'],
    ['Accepted summaries', run.telemetry.accepted, 'Evidence checks passed', 'check'],
    [
      'Evidence citations',
      accepted.reduce(
        (n, generation) =>
          n + generation.output!.claims.reduce((sum, claim) => sum + claim.evidence.length, 0),
        0,
      ),
      'Every claim is inspectable',
      'audit',
    ],
  ];
  return (
    <>
      <div className="intel-metrics">
        {metrics.map(([label, value, detail, icon]) => (
          <div className="intel-metric" key={label}>
            <div>
              <span>{label}</span>
              <Icon name={String(icon)} size={17} />
            </div>
            <strong>{value}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>
      <div className="intel-content-grid">
        <section>
          <div className="intel-section-heading">
            <div>
              <h2>
                Intelligence feed <span className="intel-count">{accepted.length}</span>
              </h2>
              <p>Source-linked summaries from the current snapshot.</p>
            </div>
            <span className="intel-tiny">18 SEP 2026 · UTC</span>
          </div>
          <div className="intel-summary-grid">
            {accepted.map((generation) => (
              <SummaryCard key={generation.id} generation={generation} onEvidence={onEvidence} />
            ))}
          </div>
        </section>
        <aside className="intel-right-rail">
          <section className="intel-flow-card">
            <div className="intel-section-heading">
              <h2>One auditable path</h2>
              <Icon name="shield" size={18} />
            </div>
            <p>Each transformation leaves a record.</p>
            <ol>
              {[
                ['Ingest', 'Source permissions checked', `${counts.ingested} accepted`],
                ['Resolve', 'Exact URLs + content hashes', `${counts.clusters} clusters`],
                ['Generate', 'Versioned prompt + schema', 'Fixture provider'],
                ['Validate', 'Citations + evidence spans', `${accepted.length} accepted`],
              ].map(([label, description, value], index) => (
                <li key={label}>
                  <span className="intel-step">{index + 1}</span>
                  <div>
                    <strong>{label}</strong>
                    <small>{description}</small>
                    <span className="intel-step-value">{value}</span>
                  </div>
                  <Icon name="check" size={16} />
                </li>
              ))}
            </ol>
            <Link to="/audit">
              Explore the audit trail <Icon name="arrow" size={16} />
            </Link>
          </section>
          <section className="intel-withheld">
            <span className="intel-eyebrow">WITHHELD, BY DESIGN</span>
            <strong>
              {counts.quarantined + run.telemetry.skipped}
              <span> records</span>
            </strong>
            <p>
              Two blocked sources never enter ingestion. One undated item is withheld from
              generation.
            </p>
            <Link to="/lineage">
              Inspect source gates <Icon name="arrow" size={14} />
            </Link>
          </section>
          <div className="intel-snapshot">
            <span className="intel-eyebrow">SNAPSHOT IDENTITY</span>
            <code>{short(run.snapshot.datasetHash)}</code>
            <p>Same inputs, same semantic hash.</p>
          </div>
        </aside>
      </div>
    </>
  );
}

function Lineage({ onEvidence }: { onEvidence: (item: EvidenceItem) => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const articles = run.snapshot.dataset.articles.filter((article) => {
    const source = run.snapshot.dataset.sources.find((source) => source.id === article.sourceId)!;
    const allowed = source.enabled && source.legalStatus === 'allowed';
    return (
      (filter === 'all' || (filter === 'ingested' ? allowed : !allowed)) &&
      `${article.title} ${source.name}`.toLowerCase().includes(query.toLowerCase())
    );
  });
  return (
    <section className="intel-table-panel">
      <div className="intel-table-tools">
        <div className="intel-tabs">
          {[
            ['all', 'All records'],
            ['ingested', 'Ingested'],
            ['quarantined', 'Quarantined'],
          ].map(([value, label]) => (
            <button
              className={filter === value ? 'active' : ''}
              key={value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="intel-search">
          <Icon name="search" size={17} />
          <input
            aria-label="Search source records"
            placeholder="Search source records"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="intel-table-scroll">
        <table className="intel-table">
          <thead>
            <tr>
              <th>Source record</th>
              <th>Publisher</th>
              <th>Published · UTC</th>
              <th>Ingestion gate</th>
              <th>Lineage</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => {
              const item = run.snapshot.items.find(
                (item) => item.itemId === `${article.sourceId}::${article.id}`,
              );
              return (
                <tr key={`${article.sourceId}::${article.id}`}>
                  <td>
                    <strong>{article.title}</strong>
                    <small>
                      {article.category} · {article.id}
                    </small>
                  </td>
                  <td>{sourceName(article.sourceId)}</td>
                  <td className="intel-mono">
                    {article.publishedAt ? time(article.publishedAt) : 'Unknown'}
                  </td>
                  <td>
                    <Status muted={!item}>{item ? 'Ingested' : 'Quarantined'}</Status>
                    {!item && (
                      <small>
                        {run.snapshot.quarantined
                          .find((record) => record.itemId === `${article.sourceId}::${article.id}`)
                          ?.reason.replaceAll('_', ' ')}
                      </small>
                    )}
                  </td>
                  <td>
                    {item ? (
                      <button className="intel-text-button" onClick={() => onEvidence(item)}>
                        Inspect <Icon name="arrow" size={14} />
                      </button>
                    ) : (
                      <span className="intel-fine">No raw payload</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {articles.length === 0 && <p className="intel-empty">No source records match this search.</p>}
      <div className="intel-table-footer">
        {articles.length} records · Source timestamps remain separate from observation time.
      </div>
    </section>
  );
}

function Audit({ onEvidence }: { onEvidence: (item: EvidenceItem) => void }) {
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get('generation');
  const [selected, setSelected] = useState(requested ?? accepted[0].id);
  const generation =
    run.generations.find((generation) => generation.id === selected) ?? accepted[0];
  const [tab, setTab] = useState('output');
  return (
    <div className="intel-audit-grid">
      <aside className="intel-generation-list">
        <span className="intel-eyebrow">GENERATIONS · {run.generations.length}</span>
        {run.generations.map((item) => (
          <button
            key={item.id}
            className={generation.id === item.id ? 'selected' : ''}
            onClick={() => setSelected(item.id)}
          >
            <span>
              {run.snapshot.clusters.find((cluster) => cluster.id === item.clusterId)!.category}
            </span>
            <strong>
              {run.snapshot.clusters.find((cluster) => cluster.id === item.clusterId)!.title}
            </strong>
            <Status muted={item.status !== 'accepted'}>{item.status}</Status>
          </button>
        ))}
      </aside>
      <section className="intel-audit-main">
        <div className="intel-audit-title">
          <div>
            <span className="intel-eyebrow">GENERATION RECORD</span>
            <h2>{generation.output?.headline ?? 'Generation withheld'}</h2>
            <code>{generation.id}</code>
          </div>
          <Status muted={generation.status !== 'accepted'}>{generation.status}</Status>
        </div>
        <div className="intel-audit-meta">
          <Field label="Provider" value="Offline fixture" />
          <Field label="Model identity" value={generation.model.returned} mono />
          <Field label="Prompt version" value={generation.prompt.version} mono />
          <Field label="Provider calls" value={generation.telemetry.attempts.length} />
        </div>
        <div className="intel-tabs intel-audit-tabs">
          {[
            ['output', 'Grounded output'],
            ['prompt', 'Prompt & contract'],
            ['validation', 'Validation'],
            ['json', 'Raw JSON'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={tab === value ? 'active' : ''}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="intel-audit-body">
          {tab === 'output' && (
            <>
              {generation.output?.claims.map((claim, index) => (
                <section className="intel-audit-claim" key={index}>
                  <div className="intel-claim-number">{String(index + 1).padStart(2, '0')}</div>
                  <div>
                    <h3>{claim.text}</h3>
                    {claim.evidence.map((citation) => (
                      <button
                        className="intel-evidence-quote"
                        key={citation.itemId}
                        onClick={() =>
                          onEvidence(
                            run.snapshot.items.find((item) => item.itemId === citation.itemId)!,
                          )
                        }
                      >
                        <span className="intel-eyebrow">
                          VERBATIM SOURCE EVIDENCE <Icon name="external" size={12} />
                        </span>
                        <q>{citation.quote}</q>
                        <small>
                          {sourceName(
                            run.snapshot.items.find((item) => item.itemId === citation.itemId)!
                              .sourceId,
                          )}{' '}
                          · {citation.itemId}
                        </small>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              <div className="intel-note">
                <Icon name="shield" size={19} />
                <p>
                  {generation.output?.uncertainty.join(' ') ??
                    generation.validation.issues.map((issue) => issue.message).join(' ')}
                </p>
              </div>
            </>
          )}
          {tab === 'prompt' && (
            <>
              <div className="intel-hash-pair">
                <Field label="Prompt SHA-256" value={generation.prompt.sha256} mono />
                <Field label="Schema SHA-256" value={generation.schema.sha256} mono />
              </div>
              <pre className="intel-prompt">{generation.prompt.text}</pre>
              <p className="intel-fine">
                Strict summary-v1 schema · temperature 0 for live requests · no tools · source
                records treated as untrusted data.
              </p>
            </>
          )}
          {tab === 'validation' && (
            <>
              <p className="intel-fine">
                Mechanical validation enforces the contract and citation integrity. It does not
                prove semantic entailment.
              </p>
              {generation.validation.checks.map((check) => (
                <div className="intel-validation-row" key={check}>
                  <Icon name="check" />
                  <span>{check.replaceAll('_', ' ')}</span>
                  <Status muted={generation.status !== 'accepted'}>
                    {generation.status === 'accepted' ? 'Passed' : 'Not accepted'}
                  </Status>
                </div>
              ))}
              {generation.validation.issues.map((issue) => (
                <p key={issue.code}>
                  {issue.code}: {issue.message}
                </p>
              ))}
            </>
          )}
          {tab === 'json' && (
            <pre className="intel-json">{JSON.stringify(generation, null, 2)}</pre>
          )}
        </div>
        <div className="intel-audit-footer">
          <Icon name="source" size={15} />
          <span>{generation.sourceItemIds.length} source records</span>
          <code>input {short(generation.inputHash)}</code>
        </div>
      </section>
    </div>
  );
}

function Runtime() {
  const max = Math.max(...run.telemetry.stages.map((stage) => stage.durationMs), 0.001);
  return (
    <div className="intel-runtime-grid">
      <section className="intel-runtime-panel">
        <span className="intel-eyebrow">CAPTURED LOCAL EXECUTION</span>
        <h2>A run you can inspect.</h2>
        <p>
          Wall-clock timings from the committed offline run. Repeat runs preserve the semantic
          result; timing varies by machine.
        </p>
        <div className="intel-latency-total">
          <strong>{run.telemetry.totalMs.toFixed(2)}</strong>
          <span>ms end to end</span>
          <Status>Local replay</Status>
        </div>
        <div className="intel-bars">
          {run.telemetry.stages.map((stage) => (
            <div key={stage.name}>
              <div>
                <span>{stage.name}</span>
                <code>{duration(stage.durationMs)}</code>
              </div>
              <div className="intel-bar-track">
                <span style={{ width: `${Math.max(1, (stage.durationMs / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="intel-runtime-stats">
          <Field label="Provider requests" value="0" />
          <Field label="API spend" value="$0.00" />
          <Field label="LLM tokens" value="Not applicable" />
        </div>
        <p className="intel-fine">
          No provider call was made. Model latency and token usage are null, not estimated. Live
          runs record provider-reported usage and versioned cost estimates.
        </p>
      </section>
      <section className="intel-runtime-panel">
        <span className="intel-eyebrow">REPRODUCIBILITY</span>
        <h2>Identity survives replay.</h2>
        <dl className="intel-runtime-identities">
          <Field label="Semantic hash" value={run.semanticHash} mono />
          <Field label="Dataset hash" value={run.snapshot.datasetHash} mono />
          <Field label="Pipeline" value={run.versions.pipeline} mono />
          <Field label="Clustering rules" value={run.versions.dedupe} mono />
          <Field label="Validator" value={run.versions.validation} mono />
        </dl>
        <div className="intel-command">
          <span>REPRODUCE THIS SNAPSHOT</span>
          <code>pnpm pipeline:replay</code>
          <code>pnpm demo:verify</code>
        </div>
        <a
          className="intel-doc-link"
          href={`${repository}/blob/main/docs/REPRODUCIBILITY.md`}
          target="_blank"
          rel="noreferrer"
        >
          Read the reproducibility contract <Icon name="external" size={15} />
        </a>
      </section>
    </div>
  );
}

export default function IntelligenceWorkspace() {
  const location = useLocation();
  const [evidence, setEvidence] = useState<EvidenceItem | null>(null);
  const [reproduce, setReproduce] = useState(false);
  useEffect(() => {
    if (evidence)
      document
        .querySelector('[aria-label="Source evidence"]')
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [evidence]);
  const view =
    location.pathname === '/lineage'
      ? 'lineage'
      : location.pathname === '/audit'
        ? 'audit'
        : location.pathname === '/runtime'
          ? 'runtime'
          : 'overview';
  const headings = {
    overview: [
      'News intelligence',
      'Every summary starts with a source. Every claim keeps its evidence.',
    ],
    lineage: ['Source explorer', 'Inspect what entered the pipeline, what was withheld, and why.'],
    audit: ['Generation audit', 'Follow the full path from source records to validated output.'],
    runtime: ['Runtime telemetry', 'Measured execution. Versioned inputs. Reproducible evidence.'],
  };
  return (
    <div className="intel-app">
      <aside className="intel-sidebar">
        <Link to="/" className="intel-brand">
          <span className="intel-logomark">
            <span />
          </span>
          <span>
            argus<small>NEWS INTELLIGENCE</small>
          </span>
        </Link>
        <div className="intel-workspace-label">
          WORKSPACE <span>01</span>
        </div>
        <nav aria-label="Intelligence workspace">
          {[
            ['/', 'Overview', 'grid', 'overview'],
            ['/lineage', 'Source explorer', 'source', 'lineage'],
            ['/audit', 'Generation audit', 'audit', 'audit'],
            ['/runtime', 'Runtime telemetry', 'pulse', 'runtime'],
          ].map(([path, label, icon, key]) => (
            <Link key={path} className={view === key ? 'active' : ''} to={path}>
              <Icon name={icon} />
              {label}
              {view === key && <span className="intel-nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="intel-sidebar-section">MORE TO EXPLORE</div>
        <Link className="intel-secondary-nav" to="/radar">
          <Icon name="grid" size={18} />
          News radar
          <Icon name="arrow" size={14} />
        </Link>
        <a
          className="intel-secondary-nav"
          href={`${repository}#architecture`}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="code" size={18} />
          Architecture
          <Icon name="external" size={13} />
        </a>
        <div className="intel-sidebar-bottom">
          <div>
            <span className="intel-live-dot" />
            Evidence first
          </div>
          <p>
            Deterministic inputs.
            <br />
            Auditable generation.
          </p>
          <a href={repository} target="_blank" rel="noreferrer">
            View repository <Icon name="external" size={14} />
          </a>
          <span className="intel-version">ARGUS / 1.0</span>
        </div>
      </aside>
      <div className="intel-main">
        <header className="intel-topbar">
          <div>
            WORKSPACE <span>/</span> {view === 'overview' ? 'OVERVIEW' : view.toUpperCase()}
          </div>
          <div>
            <Status>Offline replay</Status>
            <span className="intel-avatar">AN</span>
          </div>
        </header>
        <main className="intel-main-content">
          <div className="intel-page-header">
            <div>
              <span className="intel-eyebrow">SOURCE-GROUNDED · INSPECTABLE BY DESIGN</span>
              <h1>{headings[view][0]}</h1>
              <p>{headings[view][1]}</p>
            </div>
            <button className="intel-primary-button" onClick={() => setReproduce(!reproduce)}>
              <Icon name="code" size={17} />
              Reproduce run
            </button>
          </div>
          <div className="intel-mode-banner">
            <div>
              <span className="intel-mode-dot" />
              <strong>Synthetic dataset</strong>
              <span className="intel-banner-divider" />
              <span>Fixture summaries · no live model call · no API key required</span>
            </div>
            <span className="intel-mono">snapshot / {run.snapshot.dataset.id}</span>
          </div>
          {reproduce && (
            <section className="intel-reproduce" aria-label="Reproduce this run">
              <strong>Run the same pipeline locally</strong>
              <pre>
                pnpm install --frozen-lockfile{'\n'}pnpm pipeline:replay{'\n'}pnpm demo:verify
              </pre>
              <p>
                For live OpenAI generation, configure OPENAI_API_KEY locally and run{' '}
                <code>pnpm pipeline:live</code>. Credentials never enter this browser.
              </p>
            </section>
          )}
          {view === 'overview' && <Overview onEvidence={setEvidence} />}
          {view === 'lineage' && <Lineage onEvidence={setEvidence} />}
          {view === 'audit' && <Audit onEvidence={setEvidence} />}
          {view === 'runtime' && <Runtime />}
          {evidence && <EvidencePanel item={evidence} onClose={() => setEvidence(null)} />}
          <footer className="intel-footer">
            <span>
              <Icon name="shield" size={14} />
              Source grounded. Human judgment stays in control.
            </span>
            <span>Fictional sample data · no trading recommendations</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
