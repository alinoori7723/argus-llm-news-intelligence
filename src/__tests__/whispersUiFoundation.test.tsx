import { describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WhispersPanel } from '@/components/WhispersPanel';
import Dashboard from '@/pages/Dashboard';
import {
  WHISPER_DECISION_VIEWS,
  whisperBootstrapStore,
} from '@/fixtures/whispers/whisperBootstrap';
import type { WhisperDecisionView } from '@/domain/whispers';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const src = (rel: string) => readFileSync(resolve(repoRoot, rel), 'utf8');

const view = (over: Partial<WhisperDecisionView> = {}): WhisperDecisionView => ({
  decisionId: 'd.test',
  candidateSourceType: 'item',
  level: 'whisper',
  message: 'Source-backed item needs review',
  reason: 'eligible',
  ruleVersion: 'whisper-rule-v1',
  targetType: 'item',
  targetId: 'it.test',
  ...over,
});

describe('2. WhispersPanel is render-only', () => {
  it('renders the Glow / Whisper / Hold attention cards it is given', () => {
    render(
      <MemoryRouter>
        <WhispersPanel
          decisions={[
            view({ decisionId: 'd.glow', level: 'glow', message: 'Confirmed cluster updated' }),
            view({ decisionId: 'd.whisper', level: 'whisper' }),
            view({ decisionId: 'd.hold', level: 'hold', message: 'Held by cooldown' }),
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('whisper-d.glow')).toHaveAttribute('data-level', 'glow');
    expect(screen.getByTestId('whisper-d.whisper')).toHaveAttribute('data-level', 'whisper');
    expect(screen.getByTestId('whisper-d.hold')).toHaveAttribute('data-level', 'hold');
    expect(within(screen.getByTestId('whispers-attention')).queryAllByRole('article')).toHaveLength(
      3,
    );
  });

  it('does NOT render Suppress as an attention notification', () => {
    render(
      <MemoryRouter>
        <WhispersPanel
          decisions={[
            view({ decisionId: 'd.keep', level: 'whisper' }),
            view({
              decisionId: 'd.drop',
              level: 'suppress',
              message: 'Held by cooldown',
              reason: 'cooldown_active',
            }),
          ]}
        />
      </MemoryRouter>,
    );
    const attention = screen.getByTestId('whispers-attention');
    expect(within(attention).queryByTestId('whisper-d.drop')).toBeNull();

    const inspect = screen.getByTestId('whispers-suppressed');
    expect(inspect.textContent).toMatch(/inspection only/i);
    expect(within(inspect).getByTestId('whisper-suppressed-d.drop')).toBeTruthy();
  });

  it('renders the per-decision evidence/audit/cluster/calendar fields from the view', () => {
    render(
      <MemoryRouter>
        <WhispersPanel
          decisions={[
            view({
              decisionId: 'd.full',
              priorityReason: 'tier:reputable',
              verificationTier: 'confirmed',
              freshnessState: 'live',
              evidenceLabel: 'open evidence',
              evidenceRef: 'src-item-1',
              evidenceHref: 'https://example.test/x',
              auditLabel: 'open audit trail',
              auditHref: '/audit/d.full',
              clusterId: 'cl.1',
              confirmedMemberCount: 3,
              clusterRuleVersion: 'cluster-rule-v1',
            }),
          ]}
        />
      </MemoryRouter>,
    );
    const card = screen.getByTestId('whisper-d.full');
    expect(within(card).getByText(/tier:reputable/)).toBeTruthy();
    expect(within(card).getByText(/confirmed cluster cl\.1 · 3 members/)).toBeTruthy();
    expect(within(card).getByText(/cluster-rule-v1/)).toBeTruthy();
    expect(within(card).getByText('src-item-1')).toBeTruthy();
    expect(within(card).getByText('open audit trail')).toBeTruthy();
  });

  it('renders an empty state when there are no attention decisions', () => {
    render(
      <MemoryRouter>
        <WhispersPanel decisions={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no active whispers/i)).toBeTruthy();
  });
});

describe('3. runtime wiring — presence', () => {
  it('Dashboard mounts the WhispersPanel fed by WHISPER_DECISION_VIEWS', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('whispers-panel')).toBeTruthy();
    const attentionCount = WHISPER_DECISION_VIEWS.filter((d) => d.level !== 'suppress').length;
    expect(within(screen.getByTestId('whispers-attention')).queryAllByRole('article')).toHaveLength(
      attentionCount,
    );
  });
});

describe('4. runtime wiring — absence', () => {
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

  it('no page/component imports engine, candidate, store, helpers, or the selector', () => {
    const FORBIDDEN =
      /\bevaluateWhisperCandidate\b|\bWhisperCandidate\b|\bWhisperHistoryStore\b|\bInMemoryWhisperHistoryStore\b|\bselectWhisperDecisions\b|\bevaluateEligibility\b|\bevaluateRateLimits\b|\bevaluateRepeat\b|\bevaluateQuietWindow\b/;
    expect(uiFiles.filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('no page/component reads raw source-proof fields to decide attention', () => {
    expect(
      uiFiles.filter((f) => /sourceLegalStatus|sourceEnabled/.test(readFileSync(f, 'utf8'))),
    ).toEqual([]);
  });

  it('WhispersPanel imports ONLY the WhisperDecisionView render type from the domain', () => {
    const code = src('src/components/WhispersPanel.tsx');
    const domainImports = [...code.matchAll(/import\s+([^;]*?)\s+from\s+'@\/domain\/whispers'/g)];
    expect(domainImports.length).toBe(1);
    expect(domainImports[0][0]).toMatch(/import\s+type\s/);
    expect(domainImports[0][1]).toMatch(/WhisperDecisionView/);
    expect(domainImports[0][1]).not.toMatch(/evaluate|Store|Candidate|select/);
  });
});

describe('5. rendering never mutates history', () => {
  it('the engine ran once at the bootstrap boundary; re-render does not append', () => {
    const before = whisperBootstrapStore.decisionCount;
    expect(before).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      );
      cleanup();
    }
    render(
      <MemoryRouter>
        <WhispersPanel decisions={WHISPER_DECISION_VIEWS} />
      </MemoryRouter>,
    );
    expect(whisperBootstrapStore.decisionCount).toBe(before);
  });

  it('WHISPER_DECISION_VIEWS array AND every view object are deep-frozen', () => {
    expect(Object.isFrozen(WHISPER_DECISION_VIEWS)).toBe(true);
    expect(WHISPER_DECISION_VIEWS.length).toBeGreaterThan(0);
    for (const v of WHISPER_DECISION_VIEWS) {
      expect(Object.isFrozen(v)).toBe(true);
    }
  });

  it('mutating a frozen view field cannot change its value', () => {
    const v = WHISPER_DECISION_VIEWS[0];
    const originalLevel = v.level;
    const originalReason = v.reason;

    try {
      (v as unknown as { level: string }).level = 'whisper-tampered';
      (v as unknown as { reason: string }).reason = 'tampered';
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
    }
    expect(v.level).toBe(originalLevel);
    expect(v.reason).toBe(originalReason);
  });

  it('cannot push/replace entries in the frozen views array', () => {
    const before = WHISPER_DECISION_VIEWS.length;
    try {
      (WHISPER_DECISION_VIEWS as unknown as WhisperDecisionView[]).push(view());
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
    }
    expect(WHISPER_DECISION_VIEWS.length).toBe(before);
  });
});

describe('6. calm, no delivery, no forbidden implementation', () => {
  const panel = src('src/components/WhispersPanel.tsx');
  const dash = src('src/pages/Dashboard.tsx');

  it('uses no notification / sound / timer / storage / popup APIs', () => {
    const FORBIDDEN =
      /Notification|new Audio|navigator\.vibrate|setTimeout|setInterval|requestAnimationFrame|localStorage|sessionStorage|indexedDB|window\.open|\.focus\(\)/;
    expect(panel).not.toMatch(FORBIDDEN);
  });

  it('uses no trade-action / FOMO / market-direction wording', () => {
    const FORBIDDEN =
      /buy now|sell now|go long|go short|\bentry\b|trade signal|don't miss|act now|urgent/i;
    expect(panel).not.toMatch(FORBIDDEN);

    expect(panel + dash).toMatch(/source-backed|review|cooldown|evidence|audit/i);
  });

  it('uses no flashing / aggressive red-green trading colors', () => {
    const FORBIDDEN = /animate-(pulse|ping|bounce)|bg-red-|bg-green-|text-red-5|text-green-5|blink/;
    expect(panel).not.toMatch(FORBIDDEN);
  });
});
