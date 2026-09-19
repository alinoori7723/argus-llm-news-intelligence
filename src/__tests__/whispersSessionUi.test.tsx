import { describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WhispersPanel } from '@/components/WhispersPanel';
import Dashboard from '@/pages/Dashboard';
import {
  FakeWhisperClock,
  InMemoryWhisperHistoryStore,
  WHISPER_RULE_VERSION,
  type WhisperDecisionView,
} from '@/domain/whispers';
import {
  createWhisperSessionController,
  useWhisperSession,
} from '@/fixtures/whispers/whisperSessionBootstrap';
import { WHISPER_DECISION_VIEWS } from '@/fixtures/whispers/whisperBootstrap';
import { BASE_MS } from './_whisperHelpers';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const src = (rel: string) => readFileSync(resolve(repoRoot, rel), 'utf8');

const view = (over: Partial<WhisperDecisionView> = {}): WhisperDecisionView =>
  Object.freeze({
    decisionId: 'd.1',
    candidateSourceType: 'item',
    level: 'whisper',
    message: 'Source-backed item to review',
    reason: 'whisper: whisper_threshold_met',
    ruleVersion: WHISPER_RULE_VERSION,
    targetType: 'item',
    targetId: 'it.1',
    auditHref: '/audit/d.1',
    evidenceHref: 'https://example.test/x',
    evidenceRef: 'src-1',
    ...over,
  });

function TestSurface({
  baseViews,
  clock,
}: {
  baseViews: WhisperDecisionView[];
  clock: FakeWhisperClock;
}) {
  const [controller] = useState(() =>
    createWhisperSessionController({
      baseViews,
      historyStore: new InMemoryWhisperHistoryStore(),
      clock,
    }),
  );
  const whispers = useWhisperSession(controller);
  return (
    <MemoryRouter>
      <WhispersPanel
        decisions={[
          ...whispers.session.activeDecisions,
          ...whispers.session.inspectionOnlyDecisions,
        ]}
        heldByDismissal={whispers.session.heldByInteraction}
        onDismiss={whispers.onDismiss}
        onMarkSeen={whispers.onMarkSeen}
        onOpenAudit={whispers.onOpenAudit}
        onOpenEvidence={whispers.onOpenEvidence}
      />
    </MemoryRouter>
  );
}

describe('C. dynamic recompute UI', () => {
  it('renders the active projected decisions', () => {
    render(
      <TestSurface
        baseViews={[
          view({ decisionId: 'd.1', targetId: 'it.1' }),
          view({ decisionId: 'd.2', targetId: 'it.2' }),
        ]}
        clock={new FakeWhisperClock(BASE_MS)}
      />,
    );
    const attention = screen.getByTestId('whispers-attention');
    expect(within(attention).queryByTestId('whisper-d.1')).toBeTruthy();
    expect(within(attention).queryByTestId('whisper-d.2')).toBeTruthy();
  });

  it('Dismiss removes the card from the active region via projection (held section, not local state)', () => {
    render(
      <TestSurface
        baseViews={[
          view({ decisionId: 'd.1', targetId: 'it.1' }),
          view({ decisionId: 'd.2', targetId: 'it.2' }),
        ]}
        clock={new FakeWhisperClock(BASE_MS)}
      />,
    );
    const attention = screen.getByTestId('whispers-attention');
    expect(within(attention).queryByTestId('whisper-d.1')).toBeTruthy();

    const card = within(attention).getByTestId('whisper-d.1');
    fireEvent.click(within(card).getByText('Dismiss'));

    expect(
      within(screen.getByTestId('whispers-attention')).queryByTestId('whisper-d.1'),
    ).toBeNull();
    expect(
      within(screen.getByTestId('whispers-attention')).queryByTestId('whisper-d.2'),
    ).toBeTruthy();

    expect(screen.getByTestId('whispers-held')).toBeTruthy();
    expect(screen.getByTestId('whisper-held-d.1')).toBeTruthy();
  });

  it('Mark seen does NOT remove the card', () => {
    render(<TestSurface baseViews={[view()]} clock={new FakeWhisperClock(BASE_MS)} />);
    fireEvent.click(screen.getByText('Mark seen'));
    expect(
      within(screen.getByTestId('whispers-attention')).queryByTestId('whisper-d.1'),
    ).toBeTruthy();
    expect(screen.queryByTestId('whispers-held')).toBeNull();
  });

  it('Open audit / Open evidence do NOT remove the card', () => {
    render(<TestSurface baseViews={[view()]} clock={new FakeWhisperClock(BASE_MS)} />);
    fireEvent.click(screen.getByText('Open audit'));
    fireEvent.click(screen.getByText('Open evidence'));
    expect(
      within(screen.getByTestId('whispers-attention')).queryByTestId('whisper-d.1'),
    ).toBeTruthy();
  });

  it('suppressed decisions remain inspection-only after interactions', () => {
    render(
      <TestSurface
        baseViews={[
          view({ decisionId: 'd.1' }),
          view({ decisionId: 'd.sup', targetId: 'it.s', level: 'suppress' }),
        ]}
        clock={new FakeWhisperClock(BASE_MS)}
      />,
    );
    expect(
      within(screen.getByTestId('whispers-attention')).queryByTestId('whisper-d.sup'),
    ).toBeNull();
    expect(screen.getByTestId('whispers-suppressed')).toBeTruthy();
  });

  it('the Dashboard renders the projected session surface', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('whispers-panel')).toBeTruthy();
  });
});

describe('D. runtime wiring — absence', () => {
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
  const uiFiles = [...scanDir('src/pages'), ...scanDir('src/components')];

  it('no page/component imports engine/candidate/store/action/projection-with-history', () => {
    const FORBIDDEN =
      /\bevaluateWhisperCandidate\b|\bWhisperCandidate\b|\bWhisperHistoryStore\b|\bInMemoryWhisperHistoryStore\b|\bselectWhisperDecisions\b|\brecordWhisperInteraction\b|\bprojectWhisperSessionView\b|\bevaluateEligibility\b|\bevaluateRateLimits\b/;
    expect(uiFiles.filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('no page/component reads raw source-proof fields or computes quietUntil', () => {
    expect(
      uiFiles.filter((f) =>
        /sourceLegalStatus|sourceEnabled|quietUntil/.test(readFileSync(f, 'utf8')),
      ),
    ).toEqual([]);
  });

  it('WhispersPanel has NO local state and no dismissed/seen id maps', () => {
    const code = src('src/components/WhispersPanel.tsx');
    expect(code).not.toMatch(/useState|useReducer|useRef/);
    expect(code).not.toMatch(/dismissedIds|seenIds|hiddenIds/);

    expect(code).not.toMatch(/recordWhisperInteraction|appendDismissal|appendInteraction/);
  });

  it('Dashboard useState stores Pulse selection only — whispers come from the session hook', () => {
    const code = src('src/pages/Dashboard.tsx');

    const useStates = code.match(/useState\s*[(<][^;]*/g) ?? [];
    expect(useStates.length).toBe(1);
    expect(useStates[0]).toMatch(/PulseKey/);

    expect(code).toMatch(/useWhisperSession\(\)/);
    expect(code).not.toMatch(/dismissedIds|seenIds|hiddenIds/);
  });

  it('the session hook stores only the projected session view (no hidden-card maps)', () => {
    const code = src('src/fixtures/whispers/whisperSessionBootstrap.ts');
    expect(code).toMatch(/useState<WhisperSessionView>/);
    expect(code).not.toMatch(/dismissedIds|seenIds|hiddenIds/);
  });
});

describe('E. immutability', () => {
  it('WHISPER_DECISION_VIEWS array and every view remain frozen', () => {
    expect(Object.isFrozen(WHISPER_DECISION_VIEWS)).toBe(true);
    for (const v of WHISPER_DECISION_VIEWS) expect(Object.isFrozen(v)).toBe(true);
  });

  it('clicking controls does not mutate a view object', () => {
    const v = view();
    const before = JSON.stringify(v);
    render(<TestSurface baseViews={[v]} clock={new FakeWhisperClock(BASE_MS)} />);
    fireEvent.click(screen.getByText('Mark seen'));
    expect(JSON.stringify(v)).toBe(before);
  });

  it('repeated render does not append (the surface only recomputes)', () => {
    const store = new InMemoryWhisperHistoryStore();
    const clock = new FakeWhisperClock(BASE_MS);
    const controller = createWhisperSessionController({
      baseViews: [view()],
      historyStore: store,
      clock,
    });
    function Surface() {
      const whispers = useWhisperSession(controller);
      return (
        <MemoryRouter>
          <WhispersPanel
            decisions={[...whispers.session.activeDecisions]}
            onMarkSeen={whispers.onMarkSeen}
          />
        </MemoryRouter>
      );
    }
    for (let n = 0; n < 3; n++) {
      render(<Surface />);
      cleanup();
    }
    expect(store.dismissalCount).toBe(0);
    expect(store.interactionCount).toBe(0);
    expect(store.decisionCount).toBe(0);
  });
});

describe('G. calm, no delivery, no forbidden implementation', () => {
  const panel = src('src/components/WhispersPanel.tsx');
  const bridge = src('src/fixtures/whispers/whisperSessionBootstrap.ts');
  const projection = src('src/domain/whispers/projectWhisperSessionView.ts');

  it('no notification / sound / timer / storage / network APIs in the new code', () => {
    const FORBIDDEN =
      /Notification|new Audio|navigator\.vibrate|setTimeout|setInterval|requestAnimationFrame|localStorage|sessionStorage|indexedDB|\bfetch\s*\(|XMLHttpRequest|window\.open|\.focus\(\)/;
    expect(panel).not.toMatch(FORBIDDEN);
    expect(bridge).not.toMatch(FORBIDDEN);
    expect(projection).not.toMatch(FORBIDDEN);
  });

  it('no trade-action / FOMO / market-direction wording', () => {
    const FORBIDDEN =
      /buy now|sell now|go long|go short|\bentry\b|trade signal|price trigger|get ready|urgent trade|about to move/i;
    expect(panel + bridge + projection).not.toMatch(FORBIDDEN);
  });

  it('no flashing / red-green casino classes', () => {
    expect(panel).not.toMatch(
      /animate-(pulse|ping|bounce)|bg-red-|bg-green-|text-red-5|text-green-5|blink/,
    );
  });

  it('no Date.now / no-arg new Date in projection (domain)', () => {
    expect(projection).not.toMatch(/Date\.now\s*\(|new Date\s*\(\s*\)/);
  });
});
