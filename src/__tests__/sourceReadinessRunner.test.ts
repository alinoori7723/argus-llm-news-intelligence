import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_RETRY_POLICY,
  ErroringFetchTransport,
  FakeFetchTransport,
  FakeReadinessClock,
  InMemorySourceReadinessStore,
  RecordedFixtureFetchTransport,
  SOURCE_READINESS_RULE_VERSION,
  buildSourceQuarantineRecord,
  planSourceRetry,
  runOfflineSourceReadiness,
  type SourceFetchFailure,
  type SourceReadinessProfile,
} from '@/domain/sourceReadiness';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE_MS = Date.parse('2026-06-01T12:00:00.000Z');

const ready = (over: Partial<SourceReadinessProfile> = {}): SourceReadinessProfile => ({
  sourceId: 'src.rss',
  sourceName: 'Example RSS',
  sourceKind: 'rss',
  enabled: true,
  legalStatus: 'allowed',
  tosStatus: 'allowed',
  acquisitionMode: 'recorded_fixture',
  parserSupport: 'supported',
  maxPayloadBytes: 100,
  allowedContentTypes: ['application/rss+xml'],
  timeoutMs: 5_000,
  retryPolicyId: 'retry-policy-default-v1',
  ...over,
});

describe('B. runOfflineSourceReadiness', () => {
  it('a skipped source NEVER calls the transport', () => {
    const store = new InMemorySourceReadinessStore();
    const transport = new FakeFetchTransport({
      kind: 'success',
      payloadText: 'x',
      contentType: 'application/rss+xml',
    });
    const spy = vi.spyOn(transport, 'read');
    const res = runOfflineSourceReadiness({
      sourceProfile: ready({ legalStatus: 'needs_review' }),
      transport,
      clock: new FakeReadinessClock(BASE_MS),
      store,
      runId: 'run.1',
    });
    expect(res.outcome.status).toBe('skipped');
    expect(spy).not.toHaveBeenCalled();
    expect(store.payloadCount).toBe(0);
    expect(store.runCount).toBe(1);
    expect(store.decisionCount).toBe(1);
  });

  it('an eligible source calls the offline transport exactly once', () => {
    const transport = new FakeFetchTransport({
      kind: 'success',
      payloadText: 'ok',
      contentType: 'application/rss+xml',
    });
    const spy = vi.spyOn(transport, 'read');
    runOfflineSourceReadiness({
      sourceProfile: ready(),
      transport,
      clock: new FakeReadinessClock(BASE_MS),
      store: new InMemorySourceReadinessStore(),
      runId: 'run.1',
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a successful fixture creates a recorded raw payload envelope with hash + versions', () => {
    const store = new InMemorySourceReadinessStore();
    const transport = new RecordedFixtureFetchTransport({
      'src.rss': {
        kind: 'success',
        payloadText: '<rss>ok</rss>',
        contentType: 'application/rss+xml',
      },
    });
    const res = runOfflineSourceReadiness({
      sourceProfile: ready(),
      transport,
      clock: new FakeReadinessClock(BASE_MS),
      store,
      runId: 'run.1',
    });
    expect(res.outcome.status).toBe('fetched');
    expect(store.payloadCount).toBe(1);
    const p = store.getSnapshot().payloads[0];
    expect(p.status).toBe('recorded');
    expect(p.payloadText).toBe('<rss>ok</rss>');
    expect(p.payloadHash).toMatch(/^[0-9a-f]{8}$/);
    expect(p.sourceReadinessRuleVersion).toBe(SOURCE_READINESS_RULE_VERSION);
    expect(p.fetchContractVersion).toBe('fetch-contract-v1');
  });

  it('a timeout creates a failure record AND a retry plan', () => {
    const store = new InMemorySourceReadinessStore();
    const res = runOfflineSourceReadiness({
      sourceProfile: ready(),
      transport: new FakeFetchTransport({ kind: 'timeout' }),
      clock: new FakeReadinessClock(BASE_MS),
      store,
      runId: 'run.1',
    });
    expect(res.outcome.status).toBe('failed');
    expect(res.outcome.failure?.failureCode).toBe('network_timeout');
    expect(store.failureCount).toBe(1);
    expect(res.retryPlan?.shouldRetry).toBe(true);
    expect(store.retryPlanCount).toBe(1);
  });

  it('unsupported content type creates a quarantine/rejection (metadata recorded)', () => {
    const store = new InMemorySourceReadinessStore();
    const res = runOfflineSourceReadiness({
      sourceProfile: ready(),
      transport: new FakeFetchTransport({
        kind: 'success',
        payloadText: 'plain',
        contentType: 'text/plain',
      }),
      clock: new FakeReadinessClock(BASE_MS),
      store,
      runId: 'run.1',
    });
    expect(res.outcome.status).toBe('quarantined');
    expect(store.quarantineCount).toBe(1);
    expect(store.getSnapshot().payloads[0].status).toBe('rejected');
  });

  it('payload too large creates a rejection storing metadata only (no full text)', () => {
    const store = new InMemorySourceReadinessStore();
    const big = 'x'.repeat(500);
    const res = runOfflineSourceReadiness({
      sourceProfile: ready(),
      transport: new FakeFetchTransport({
        kind: 'success',
        payloadText: big,
        contentType: 'application/rss+xml',
      }),
      clock: new FakeReadinessClock(BASE_MS),
      store,
      runId: 'run.1',
    });
    expect(res.outcome.status).toBe('quarantined');
    const p = store.getSnapshot().payloads[0];
    expect(p.status).toBe('rejected');
    expect(p.quarantineReason).toBe('payload_too_large');
    expect(p.payloadText).toBeUndefined();
    expect(p.byteLength).toBe(500);
  });

  it('malformed payload is quarantined (kept for review), not crashed', () => {
    const store = new InMemorySourceReadinessStore();
    const res = runOfflineSourceReadiness({
      sourceProfile: ready(),
      transport: new FakeFetchTransport({
        kind: 'malformed',
        payloadText: '<rss',
        contentType: 'application/rss+xml',
      }),
      clock: new FakeReadinessClock(BASE_MS),
      store,
      runId: 'run.1',
    });
    expect(res.outcome.status).toBe('quarantined');
    expect(res.outcome.failure?.failureCode).toBe('malformed_payload');
    expect(store.getSnapshot().payloads[0].status).toBe('quarantined');
  });

  it('a thrown transport error is converted into a failure outcome (never escapes)', () => {
    const store = new InMemorySourceReadinessStore();
    expect(() =>
      runOfflineSourceReadiness({
        sourceProfile: ready(),
        transport: new ErroringFetchTransport(),
        clock: new FakeReadinessClock(BASE_MS),
        store,
        runId: 'run.1',
      }),
    ).not.toThrow();
    const res = runOfflineSourceReadiness({
      sourceProfile: ready(),
      transport: new ErroringFetchTransport(),
      clock: new FakeReadinessClock(BASE_MS),
      store,
      runId: 'run.2',
    });
    expect(res.outcome.status).toBe('failed');
    expect(res.outcome.failure?.failureCode).toBe('transport_unavailable');
  });

  it('repeated runs append records (prior records preserved)', () => {
    const store = new InMemorySourceReadinessStore();
    const transport = new FakeFetchTransport({
      kind: 'success',
      payloadText: 'ok',
      contentType: 'application/rss+xml',
    });
    runOfflineSourceReadiness({
      sourceProfile: ready(),
      transport,
      clock: new FakeReadinessClock(BASE_MS),
      store,
      runId: 'run.1',
    });
    runOfflineSourceReadiness({
      sourceProfile: ready(),
      transport,
      clock: new FakeReadinessClock(BASE_MS),
      store,
      runId: 'run.2',
    });
    expect(store.runCount).toBe(2);
    expect(store.payloadCount).toBe(2);
    expect(store.getSnapshot().runs.map((r) => r.runId)).toEqual(['run.1', 'run.2']);
  });

  it('a 4xx http error is not retryable; a 5xx is retryable', () => {
    const store = new InMemorySourceReadinessStore();
    const r4 = runOfflineSourceReadiness({
      sourceProfile: ready(),
      transport: new FakeFetchTransport({ kind: 'http_error', httpStatus: 404 }),
      clock: new FakeReadinessClock(BASE_MS),
      store,
      runId: 'run.4',
    });
    expect(r4.outcome.failure?.retryable).toBe(false);
    expect(r4.retryPlan?.shouldRetry).toBe(false);

    const r5 = runOfflineSourceReadiness({
      sourceProfile: ready(),
      transport: new FakeFetchTransport({ kind: 'http_error', httpStatus: 503 }),
      clock: new FakeReadinessClock(BASE_MS),
      store,
      runId: 'run.5',
    });
    expect(r5.outcome.failure?.retryable).toBe(true);
    expect(r5.retryPlan?.shouldRetry).toBe(true);
  });
});

describe('C. InMemorySourceReadinessStore', () => {
  it('all six arrays are append-only with defensive-copy getters', () => {
    const store = new InMemorySourceReadinessStore();
    const transport = new FakeFetchTransport({ kind: 'timeout' });
    runOfflineSourceReadiness({
      sourceProfile: ready(),
      transport,
      clock: new FakeReadinessClock(BASE_MS),
      store,
      runId: 'run.1',
    });

    const snap = store.getSnapshot();
    expect(snap.runs.length).toBe(1);
    expect(snap.decisions.length).toBe(1);
    expect(snap.failures.length).toBe(1);
    expect(snap.retryPlans.length).toBe(1);

    (snap.runs as unknown as unknown[]).push({ tampered: true });
    (snap.failures[0] as unknown as { failureCode: string }).failureCode = 'tampered';
    expect(store.getSnapshot().runs.length).toBe(1);
    expect(store.getSnapshot().failures[0].failureCode).toBe('network_timeout');
  });

  it('prior records are not overwritten across runs', () => {
    const store = new InMemorySourceReadinessStore();
    runOfflineSourceReadiness({
      sourceProfile: ready({ legalStatus: 'blocked' }),
      transport: new FakeFetchTransport({ kind: 'timeout' }),
      clock: new FakeReadinessClock(BASE_MS),
      store,
      runId: 'run.1',
    });
    runOfflineSourceReadiness({
      sourceProfile: ready(),
      transport: new FakeFetchTransport({ kind: 'timeout' }),
      clock: new FakeReadinessClock(BASE_MS),
      store,
      runId: 'run.2',
    });
    expect(store.getSnapshot().decisions.map((d) => d.status)).toEqual(['skipped', 'eligible']);
  });
});

describe('D. planSourceRetry', () => {
  const failure = (over: Partial<SourceFetchFailure> = {}): SourceFetchFailure => ({
    failureCode: 'network_timeout',
    sourceId: 'src.rss',
    runId: 'run.1',
    observedAt: new Date(BASE_MS).toISOString(),
    retryable: true,
    quarantineRequired: false,
    reason: 'simulated',
    ruleVersion: SOURCE_READINESS_RULE_VERSION,
    ...over,
  });

  it('a retryable timeout gets a deterministic nextAttemptAt and delay', () => {
    const plan = planSourceRetry({
      failure: failure(),
      attempt: 1,
      retryPolicy: DEFAULT_RETRY_POLICY,
      clock: new FakeReadinessClock(BASE_MS),
    });
    expect(plan.shouldRetry).toBe(true);
    expect(plan.delayMs).toBe(1_000);
    expect(plan.nextAttemptAt).toBe(new Date(BASE_MS + 1_000).toISOString());
    const plan2 = planSourceRetry({
      failure: failure(),
      attempt: 2,
      retryPolicy: DEFAULT_RETRY_POLICY,
      clock: new FakeReadinessClock(BASE_MS),
    });
    expect(plan2.delayMs).toBe(2_000);
  });

  it('non-retryable legal/ToS failure → shouldRetry false', () => {
    const plan = planSourceRetry({
      failure: failure({ failureCode: 'legal_not_allowed', retryable: false }),
      attempt: 1,
      retryPolicy: DEFAULT_RETRY_POLICY,
      clock: new FakeReadinessClock(BASE_MS),
    });
    expect(plan.shouldRetry).toBe(false);
    expect(plan.reason).toBe('failure_not_retryable');
  });

  it('unsupported parser → shouldRetry false', () => {
    const plan = planSourceRetry({
      failure: failure({ failureCode: 'parser_unsupported', retryable: false }),
      attempt: 1,
      retryPolicy: DEFAULT_RETRY_POLICY,
      clock: new FakeReadinessClock(BASE_MS),
    });
    expect(plan.shouldRetry).toBe(false);
  });

  it('payload_too_large → shouldRetry false', () => {
    const plan = planSourceRetry({
      failure: failure({ failureCode: 'payload_too_large', retryable: false }),
      attempt: 1,
      retryPolicy: DEFAULT_RETRY_POLICY,
      clock: new FakeReadinessClock(BASE_MS),
    });
    expect(plan.shouldRetry).toBe(false);
  });

  it('stops retrying once max attempts is reached', () => {
    const plan = planSourceRetry({
      failure: failure(),
      attempt: 3,
      retryPolicy: DEFAULT_RETRY_POLICY,
      clock: new FakeReadinessClock(BASE_MS),
    });
    expect(plan.shouldRetry).toBe(false);
    expect(plan.reason).toBe('max_attempts_reached');
  });

  it('the planner/source contain no timer/sleep/schedule calls', () => {
    const code = readFileSync(resolve(repoRoot, 'src/domain/sourceReadiness/retryPlan.ts'), 'utf8');
    expect(code).not.toMatch(/setTimeout|setInterval|setImmediate|\.sleep\(|requestAnimationFrame/);
  });
});

describe('E. quarantine', () => {
  it('carries sourceId/runId/reason/ruleVersion and review flag; never auto-promotes', () => {
    const q = buildSourceQuarantineRecord({
      failure: {
        failureCode: 'malformed_payload',
        sourceId: 'src.rss',
        runId: 'run.1',
        observedAt: new Date(BASE_MS).toISOString(),
        retryable: false,
        quarantineRequired: true,
        reason: 'malformed payload',
        ruleVersion: SOURCE_READINESS_RULE_VERSION,
      },
      payloadId: 'pay-run.1-src.rss',
    });
    expect(q.sourceId).toBe('src.rss');
    expect(q.runId).toBe('run.1');
    expect(q.failureCode).toBe('malformed_payload');
    expect(q.reviewRequired).toBe(true);
    expect(q.ruleVersion).toBe(SOURCE_READINESS_RULE_VERSION);
  });
});

describe('F. no network / timer / storage implementation', () => {
  const scanDir = (rel: string): string[] => {
    const dir = join(repoRoot, rel);
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) out.push(...scanDir(join(rel, e.name)));
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
    }
    return out;
  };

  it('no source-readiness file performs network / timer / storage I/O', () => {
    const FORBIDDEN =
      /\bfetch\s*\(|XMLHttpRequest|\baxios\b|\bundici\b|\bgot\s*\(|node-fetch|http\.request|https\.request|WebSocket|EventSource|setTimeout|setInterval|localStorage|indexedDB/;
    const offenders = scanDir('src/domain/sourceReadiness').filter((f) =>
      FORBIDDEN.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('the domain area imports no network/transport package', () => {
    const offenders = scanDir('src/domain/sourceReadiness').filter((f) =>
      /from ['"](axios|undici|got|node-fetch|http|https|ws|net|tls)['"]/.test(
        readFileSync(f, 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
