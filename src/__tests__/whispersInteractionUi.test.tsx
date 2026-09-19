import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WhispersPanel } from '@/components/WhispersPanel';
import Dashboard from '@/pages/Dashboard';
import { WHISPER_DECISION_VIEWS } from '@/fixtures/whispers/whisperBootstrap';
import {
  whisperInteractionStore,
  dispatchWhisperInteraction,
} from '@/fixtures/whispers/whisperInteractionBootstrap';

import { whisperSessionStore } from '@/fixtures/whispers/whisperSessionBootstrap';
import type { WhisperDecisionView } from '@/domain/whispers';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const src = (rel: string) => readFileSync(resolve(repoRoot, rel), 'utf8');

const view = (over: Partial<WhisperDecisionView> = {}): WhisperDecisionView => ({
  decisionId: 'd.1',
  candidateSourceType: 'item',
  level: 'whisper',
  message: 'Source-backed item to review',
  reason: 'eligible',
  ruleVersion: 'whisper-rule-v1',
  targetType: 'item',
  targetId: 'it.1',
  auditHref: '/audit/d.1',
  evidenceHref: 'https://example.test/x',
  evidenceRef: 'src-item-1',
  ...over,
});

const renderPanel = (props: Parameters<typeof WhispersPanel>[0]) =>
  render(
    <MemoryRouter>
      <WhispersPanel {...props} />
    </MemoryRouter>,
  );

describe('D. WhispersPanel interaction controls', () => {
  it('renders Dismiss / Mark seen / Open audit / Open evidence controls', () => {
    renderPanel({
      decisions: [view()],
      onDismiss: vi.fn(),
      onMarkSeen: vi.fn(),
      onOpenAudit: vi.fn(),
      onOpenEvidence: vi.fn(),
    });
    const controls = screen.getByTestId('whisper-controls-d.1');
    expect(within(controls).getByText('Dismiss')).toBeTruthy();
    expect(within(controls).getByText('Mark seen')).toBeTruthy();
    expect(within(controls).getByText('Open audit')).toBeTruthy();
    expect(within(controls).getByText('Open evidence')).toBeTruthy();
  });

  it('clicking Dismiss calls onDismiss with view identity ONLY', () => {
    const onDismiss = vi.fn();
    renderPanel({ decisions: [view()], onDismiss });
    fireEvent.click(screen.getByText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith({
      decisionId: 'd.1',
      targetType: 'item',
      targetId: 'it.1',
    });
  });

  it('clicking Mark seen / Open audit emits identity to the right callback', () => {
    const onMarkSeen = vi.fn();
    const onOpenAudit = vi.fn();
    renderPanel({ decisions: [view()], onMarkSeen, onOpenAudit });
    fireEvent.click(screen.getByText('Mark seen'));
    fireEvent.click(screen.getByText('Open audit'));
    expect(onMarkSeen).toHaveBeenCalledWith({
      decisionId: 'd.1',
      targetType: 'item',
      targetId: 'it.1',
    });
    expect(onOpenAudit).toHaveBeenCalledWith({
      decisionId: 'd.1',
      targetType: 'item',
      targetId: 'it.1',
    });
  });

  it('clicking Open evidence calls onOpenEvidence with view identity ONLY (no mutation, no removal)', () => {
    const onOpenEvidence = vi.fn();
    const v = view();
    const before = JSON.stringify(v);
    renderPanel({ decisions: [v], onOpenEvidence });
    expect(screen.getByTestId('whisper-d.1')).toBeTruthy();
    fireEvent.click(screen.getByText('Open evidence'));
    expect(onOpenEvidence).toHaveBeenCalledTimes(1);
    expect(onOpenEvidence).toHaveBeenCalledWith({
      decisionId: 'd.1',
      targetType: 'item',
      targetId: 'it.1',
    });

    expect(screen.getByTestId('whisper-d.1')).toBeTruthy();
    expect(JSON.stringify(v)).toBe(before);
  });

  it('renders NO controls when no callbacks are provided (pure render still works)', () => {
    renderPanel({ decisions: [view()] });
    expect(screen.queryByTestId('whisper-controls-d.1')).toBeNull();
  });

  it('clicking Dismiss does NOT remove the card (visual update deferred in Phase 2.8)', () => {
    renderPanel({ decisions: [view()], onDismiss: vi.fn() });
    expect(screen.getByTestId('whisper-d.1')).toBeTruthy();
    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.getByTestId('whisper-d.1')).toBeTruthy();
    expect(screen.getByText(/visual update deferred/i)).toBeTruthy();
  });

  it('suppressed decisions stay inspection-only and have no attention controls', () => {
    renderPanel({
      decisions: [view({ decisionId: 'd.sup', level: 'suppress', reason: 'cooldown_active' })],
      onDismiss: vi.fn(),
    });
    expect(
      within(screen.getByTestId('whispers-attention')).queryByTestId('whisper-d.sup'),
    ).toBeNull();
    expect(screen.getByTestId('whispers-suppressed')).toBeTruthy();
  });
});

describe('E. interaction bridge', () => {
  const id = { decisionId: 'd.b', targetType: 'item' as const, targetId: 'it.bridge-unique' };

  it('dispatch records a dismissal through the domain action + history store', () => {
    const dBefore = whisperInteractionStore.dismissalCount;
    const res = dispatchWhisperInteraction(id, 'dismiss');
    expect(res.status).toBe('recorded');
    expect(whisperInteractionStore.dismissalCount).toBe(dBefore + 1);
  });

  it('repeated dispatch dismiss for the same target is idempotent (no extra dismissal)', () => {
    const target = {
      decisionId: 'd.c',
      targetType: 'cluster' as const,
      targetId: 'cl.bridge-unique',
    };
    dispatchWhisperInteraction(target, 'dismiss');
    const dAfterFirst = whisperInteractionStore.dismissalCount;
    const res2 = dispatchWhisperInteraction(target, 'dismiss');
    expect(res2.status).toBe('ignored');
    expect(whisperInteractionStore.dismissalCount).toBe(dAfterFirst);
  });

  it('dispatch mark_seen records a separate interaction record', () => {
    const iBefore = whisperInteractionStore.interactionCount;
    const res = dispatchWhisperInteraction(
      { decisionId: 'd.s', targetType: 'item', targetId: 'it.seen-unique' },
      'mark_seen',
    );
    expect(res.status).toBe('recorded');
    expect(whisperInteractionStore.interactionCount).toBe(iBefore + 1);
  });

  it('rendering the Dashboard does NOT append any interaction/dismissal record', () => {
    const dBefore = whisperSessionStore.dismissalCount;
    const iBefore = whisperSessionStore.interactionCount;
    for (let n = 0; n < 3; n++) {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      );
      cleanup();
    }
    expect(whisperSessionStore.dismissalCount).toBe(dBefore);
    expect(whisperSessionStore.interactionCount).toBe(iBefore);
  });

  it('only a user click appends — clicking Dismiss on the Dashboard records to the session store', () => {
    const dBefore = whisperSessionStore.dismissalCount;
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    const firstDismiss = screen.getAllByText('Dismiss')[0];
    expect(firstDismiss).toBeTruthy();
    fireEvent.click(firstDismiss);
    expect(whisperSessionStore.dismissalCount).toBe(dBefore + 1);

    expect(
      within(screen.getByTestId('whispers-attention')).queryAllByRole('article').length,
    ).toBeGreaterThanOrEqual(0);
  });
});

describe('F. runtime wiring — absence', () => {
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

  it('no page/component imports the engine/candidate/store/helpers/selector/action', () => {
    const FORBIDDEN =
      /\bevaluateWhisperCandidate\b|\bWhisperCandidate\b|\bWhisperHistoryStore\b|\bInMemoryWhisperHistoryStore\b|\bselectWhisperDecisions\b|\brecordWhisperInteraction\b|\bevaluateEligibility\b|\bevaluateRateLimits\b|\bevaluateRepeat\b|\bevaluateQuietWindow\b/;
    expect(uiFiles.filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('no page/component reads raw source-proof fields or computes quietUntil', () => {
    expect(
      uiFiles.filter((f) =>
        /sourceLegalStatus|sourceEnabled|quietUntil/.test(readFileSync(f, 'utf8')),
      ),
    ).toEqual([]);
  });

  it('WhispersPanel holds NO local state and no quietUntil/record-writing', () => {
    const code = src('src/components/WhispersPanel.tsx');
    expect(code).not.toMatch(/useState|useReducer|useRef/);
    expect(code).not.toMatch(
      /quietUntil|appendDismissal|appendInteraction|recordWhisperInteraction/,
    );
    expect(code).not.toMatch(/\.filter\([^)]*dismiss/i);
  });

  it('WhispersPanel receives NO store/clock/action props', () => {
    const code = src('src/components/WhispersPanel.tsx');

    const propsBlock = code.slice(
      code.indexOf('interface WhispersPanelProps'),
      code.indexOf('}', code.indexOf('interface WhispersPanelProps')),
    );
    expect(propsBlock).not.toMatch(/historyStore|clock|recordWhisperInteraction|store/i);
  });

  it('Dashboard passes only decisions + on* callbacks to WhispersPanel (no store/clock/action props)', () => {
    const code = src('src/pages/Dashboard.tsx');
    const usage = code.slice(
      code.indexOf('<WhispersPanel'),
      code.indexOf('/>', code.indexOf('<WhispersPanel')) + 2,
    );
    expect(usage).not.toMatch(/historyStore|clock=|store=/);
    expect(usage).toMatch(/onDismiss/);
  });

  it('recordWhisperInteraction is imported ONLY by the fixtures whispers bridge layer, never by pages/components', () => {
    const uiImporters = [...scanDir('src/pages'), ...scanDir('src/components')].filter((f) =>
      /\brecordWhisperInteraction\b/.test(readFileSync(f, 'utf8')),
    );
    expect(uiImporters).toEqual([]);

    const allImporters = scanDir('src/fixtures').filter((f) =>
      /\brecordWhisperInteraction\b/.test(readFileSync(f, 'utf8')),
    );
    expect(allImporters.length).toBeGreaterThan(0);
    for (const f of allImporters) {
      expect(f.replace(/\\/g, '/')).toMatch(
        /fixtures\/whispers\/whisper(Interaction|Session)Bootstrap\.ts$/,
      );
    }
  });
});

describe('G. immutable selector output preserved', () => {
  it('WHISPER_DECISION_VIEWS array and every view remain frozen even after interaction', () => {
    expect(Object.isFrozen(WHISPER_DECISION_VIEWS)).toBe(true);
    const first = WHISPER_DECISION_VIEWS[0];
    dispatchWhisperInteraction(
      { decisionId: first.decisionId, targetType: first.targetType, targetId: first.targetId },
      'mark_seen',
    );
    for (const v of WHISPER_DECISION_VIEWS) expect(Object.isFrozen(v)).toBe(true);
  });

  it('rendering controls does not mutate a view object', () => {
    const v = WHISPER_DECISION_VIEWS[0];
    const before = JSON.stringify(v);
    renderPanel({ decisions: [v], onDismiss: vi.fn(), onMarkSeen: vi.fn() });
    fireEvent.click(screen.getAllByText('Dismiss')[0]);
    expect(JSON.stringify(WHISPER_DECISION_VIEWS[0])).toBe(before);
  });
});

describe('H. calm, no delivery, no forbidden implementation', () => {
  const panel = src('src/components/WhispersPanel.tsx');
  const bridge = src('src/fixtures/whispers/whisperInteractionBootstrap.ts');
  const action = src('src/domain/whispers/recordWhisperInteraction.ts');

  it('no notification / sound / timer / storage / network APIs in the new code', () => {
    const FORBIDDEN =
      /Notification|new Audio|navigator\.vibrate|setTimeout|setInterval|requestAnimationFrame|localStorage|sessionStorage|indexedDB|\bfetch\s*\(|XMLHttpRequest|window\.open|\.focus\(\)/;
    expect(panel).not.toMatch(FORBIDDEN);
    expect(bridge).not.toMatch(FORBIDDEN);
    expect(action).not.toMatch(FORBIDDEN);
  });

  it('no trade-action / FOMO / market-direction wording in the controls', () => {
    const FORBIDDEN =
      /buy now|sell now|go long|go short|\bentry\b|trade signal|price trigger|get ready|urgent trade|about to move/i;
    expect(panel).not.toMatch(FORBIDDEN);

    expect(panel).toMatch(/Dismiss|Mark seen|Open audit|Open evidence|deferred/);
  });

  it('no flashing / aggressive red-green classes', () => {
    expect(panel).not.toMatch(
      /animate-(pulse|ping|bounce)|bg-red-|bg-green-|text-red-5|text-green-5|blink/,
    );
  });
});
