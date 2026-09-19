import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import NarrativeStream from '@/pages/NarrativeStream';
import NewsRoom from '@/pages/NewsRoom';
import WorldRadar from '@/pages/WorldRadar';
import MorningBrief from '@/pages/MorningBrief';

const src = (rel: string) =>
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', rel), 'utf8');

const renderNewsRoom = (id: string) =>
  render(
    <MemoryRouter initialEntries={[`/newsroom/${id}`]}>
      <Routes>
        <Route path="/newsroom/:itemId" element={<NewsRoom />} />
      </Routes>
    </MemoryRouter>,
  );

describe('B. confirmed cluster display consistency', () => {
  it('Narrative Stream shows confirmedMemberCount (2) via ConfirmedClusterDisplay, not legacy itemCount (3)', () => {
    render(
      <MemoryRouter>
        <NarrativeStream />
      </MemoryRouter>,
    );
    const row = screen.getByTestId('stream-row-it.002');
    expect(row.getAttribute('data-confirmed-member-count')).toBe('2');
    expect(row.textContent ?? '').toMatch(/confirmed cluster · 2 members/);
    expect(row.textContent ?? '').not.toMatch(/3 members/);
    expect(row.textContent ?? '').not.toMatch(/cluster:cl\./);
  });

  it('News Room shows confirmedMemberCount + rule version + sourceCount, not legacy itemCount (3)', () => {
    renderNewsRoom('it.002');
    const section = screen.getByTestId('newsroom-confirmed-cluster');
    const text = section.textContent ?? '';
    expect(text).toMatch(/2 confirmed members \(cluster-rule-v1\)/);
    expect(text).toMatch(/2 sources/);
    expect(text).not.toMatch(/3 confirmed members/);
  });

  it('World Radar does not render a legacy "N clusters" count', () => {
    const { container } = render(
      <MemoryRouter>
        <WorldRadar />
      </MemoryRouter>,
    );
    expect(container.textContent ?? '').not.toMatch(/\d+\s+clusters/);
    expect(container.textContent ?? '').toMatch(/NOT confirmed cluster counts/i);
  });
});

describe('C. evidence / reference consistency', () => {
  it('Narrative Stream renders an evidence/reference for every row', () => {
    render(
      <MemoryRouter>
        <NarrativeStream />
      </MemoryRouter>,
    );
    const rows = document.querySelectorAll('article[data-item-id]');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of Array.from(rows)) {
      const ev = row.querySelector('[data-testid^="stream-row-evidence-"]');
      expect(ev).not.toBeNull();
      expect(['url', 'sourceItemId', 'itemId']).toContain(ev!.getAttribute('data-evidence-kind'));
    }
  });

  it('News Room renders evidence/reference fields', () => {
    renderNewsRoom('it.002');
    const ref = screen.getByTestId('newsroom-reference');
    expect(ref.querySelector('[data-field="sourceItemId"]')).not.toBeNull();
    expect(ref.querySelector('[data-field="itemId"]')).not.toBeNull();
  });

  it('Morning Brief scheduled events reference calendar evidence + scheduledFor', () => {
    render(
      <MemoryRouter>
        <MorningBrief />
      </MemoryRouter>,
    );
    const section = screen.getByTestId('brief-scheduled-events');
    const firstEvent = section.querySelector('[data-testid^="brief-event-"]')!;
    expect(firstEvent.querySelector('[data-field="scheduledFor"]')).not.toBeNull();
    expect(firstEvent.querySelector('[data-field="evidence"]')).not.toBeNull();
  });
});

describe('D. priority reason consistency', () => {
  it('Narrative Stream exposes a priority reason', () => {
    render(
      <MemoryRouter>
        <NarrativeStream />
      </MemoryRouter>,
    );
    const row = screen.getByTestId('stream-row-it.002');
    expect(row.getAttribute('data-priority-reason')).toBeTruthy();
    expect(row.querySelector('[data-field="priority-reason"]')).not.toBeNull();
  });

  it('News Room shows a priority reason; cluster-influenced reason names count + CLUSTER_RULE_VERSION', () => {
    renderNewsRoom('it.002');
    const reason = screen
      .getByTestId('newsroom-item')
      .querySelector('[data-field="priorityReason"]')!;
    expect(reason.textContent ?? '').toMatch(
      /confirmed cluster ccl-it\.002 size 2 \(cluster-rule-v1\)/,
    );
  });
});

describe('E. verification / freshness consistency', () => {
  it('verification tier appears in Narrative Stream and News Room', () => {
    render(
      <MemoryRouter>
        <NarrativeStream />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('stream-row-it.019').getAttribute('data-verification')).toBe(
      'unverified',
    );
    expect(screen.getByTestId('stream-row-it.022').getAttribute('data-verification')).toBe('rumor');
  });

  it('Morning Brief scheduled events show confirmation state', () => {
    render(
      <MemoryRouter>
        <MorningBrief />
      </MemoryRouter>,
    );
    const section = screen.getByTestId('brief-scheduled-events');
    const evs = section.querySelectorAll('[data-testid^="brief-event-"]');
    expect(evs.length).toBeGreaterThan(0);
    for (const e of Array.from(evs)) {
      expect(e.getAttribute('data-confirmation-state')).toBeTruthy();
    }
  });
});

describe('F. shared display helpers are wired into active surfaces (static evidence)', () => {
  it('StreamRow + News Room use buildItemDisplay', () => {
    expect(src('components/StreamRow.tsx')).toMatch(/buildItemDisplay/);
    expect(src('pages/NewsRoom.tsx')).toMatch(/buildItemDisplay/);
  });

  it('calendar surfaces use buildCalendarConfirmationDisplay', () => {
    expect(src('pages/Calendar.tsx')).toMatch(/buildCalendarConfirmationDisplay/);
    expect(src('pages/MorningBrief.tsx')).toMatch(/buildCalendarConfirmationDisplay/);
  });

  it('cluster surfaces use buildConfirmedClusterDisplay (no hardcoded legacy rule strings in News Room)', () => {
    const newsroom = src('pages/NewsRoom.tsx');
    expect(newsroom).toMatch(/display\.cluster/);

    expect(newsroom).not.toMatch(/confirmed members \(cluster-rule-v1\)/);
  });
});
