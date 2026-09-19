import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MorningBrief from '@/pages/MorningBrief';
import Calendar from '@/pages/Calendar';
import Dashboard from '@/pages/Dashboard';
import { promotableScheduledViews } from '@/domain/calendar';
import { buildRichCalendarStore, viewNow } from '@/fixtures/calendar/demoCalendar';

const CPI = 'evt-us-cpi-2026-06';

const renderPage = (el: JSX.Element) => render(<MemoryRouter>{el}</MemoryRouter>);

describe('J. Morning Brief scheduled events', () => {
  it('shows scheduled events with scheduledFor and confirmationState', () => {
    renderPage(<MorningBrief />);
    const section = screen.getByTestId('brief-scheduled-events');
    const cpi = within(section).getByTestId(`brief-event-${CPI}`);
    expect(cpi.getAttribute('data-confirmation-state')).toBeTruthy();
    expect(cpi.querySelector('[data-field="scheduledFor"]')!.textContent).toMatch(
      /2026-05-30 12:42/,
    );
    expect(section.textContent ?? '').toMatch(/confirmation:fresh/);
  });
});

describe('J. Calendar detail shows revision history + lifecycle labels', () => {
  it('renders the CPI revision history with multiple revisions', () => {
    renderPage(<Calendar />);
    const history = screen.getByTestId(`calendar-history-${CPI}`);
    expect(history.querySelectorAll('li').length).toBeGreaterThanOrEqual(2);
  });

  it('cancelled / superseded / completed labels are visible', () => {
    const { container } = renderPage(<Calendar />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/superseded/);
    expect(text).toMatch(/cancelled/);
    expect(text).toMatch(/completed/);
  });

  it('a stale event shows a needs-confirmation caveat', () => {
    const { container } = renderPage(<Calendar />);
    const caveats = container.querySelectorAll('[data-field="confirmation-caveat"]');
    expect(caveats.length).toBeGreaterThan(0);
    const text = Array.from(caveats)
      .map((c) => c.textContent)
      .join(' ');
    expect(text).toMatch(/stale|needs confirmation/i);
  });
});

describe('J. Pulse News cell does not promote stale/cancelled events', () => {
  it('the Dashboard scheduled strip shows only confirmed upcoming events', () => {
    renderPage(<Dashboard />);
    const strip = screen.getByTestId('pulse-scheduled');

    expect(within(strip).getByTestId(`pulse-scheduled-${CPI}`)).toBeInTheDocument();

    expect(strip.textContent ?? '').not.toMatch(/needs confirmation|stale/i);
  });

  it('promotableScheduledViews excludes completed (CPI) and stale events', () => {
    const store = buildRichCalendarStore();
    const promotable = promotableScheduledViews(store, viewNow());
    const ids = promotable.map((v) => v.current.sourceEventId);

    expect(ids).not.toContain(CPI);

    for (const v of promotable) {
      expect(v.current.revisionStatus).toBe('active');
      expect(v.promotion.eligible).toBe(true);
      expect(v.confirmationState).not.toBe('stale');
    }
  });
});
