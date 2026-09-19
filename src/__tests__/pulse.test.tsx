import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '@/pages/Dashboard';

const FORBIDDEN_MARKET_STATE =
  /\b(gold is calm|dxy is bid|s&p is weak|risk appetite fading|under pressure|bearish|bullish|market is waiting|dollar pressure rising)\b/i;

describe('Pulse rendering', () => {
  it('5. renders no forbidden market-state phrases inside Pulse cells', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    const grid = screen.getByTestId('pulse-grid');
    expect(grid.textContent ?? '').not.toMatch(FORBIDDEN_MARKET_STATE);
  });

  it('renders six labelled cells in the expected order', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    const expectedKeys = ['gold', 'dxy', 'spx', 'vix', 'news', 'world'];
    for (const k of expectedKeys) {
      expect(screen.getByTestId(`pulse-cell-${k}`)).toBeInTheDocument();
    }
  });

  it('6. unverified and rumor items are structurally distinct from other rows', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    const stream = screen.getByTestId('dashboard-stream');

    const unverifiedRow = within(stream).getByTestId('stream-row-it.019');
    expect(unverifiedRow.getAttribute('data-verification')).toBe('unverified');

    const rumorRow = within(stream).getByTestId('stream-row-it.022');
    expect(rumorRow.getAttribute('data-verification')).toBe('rumor');

    expect(unverifiedRow.getAttribute('data-verification')).not.toBe(
      rumorRow.getAttribute('data-verification'),
    );

    for (const row of [unverifiedRow, rumorRow]) {
      const tier = row.getAttribute('data-verification');
      expect(tier).not.toBe('verified');
      expect(tier).not.toBe('reported');
    }
  });

  it('needs_review (it.013) and disabled (it.020) items never appear in the normal stream', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    const stream = screen.getByTestId('dashboard-stream');

    expect(within(stream).queryByTestId('stream-row-it.013')).toBeNull();
    expect(within(stream).queryByTestId('stream-row-it.020')).toBeNull();
  });
});
