import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NarrativeStream from '@/pages/NarrativeStream';
import NewsRoom from '@/pages/NewsRoom';
import WorldRadar from '@/pages/WorldRadar';
import MorningBrief from '@/pages/MorningBrief';

describe('E. active surfaces show confirmed-cluster data, not legacy cluster counts', () => {
  it('Narrative Stream shows a confirmed-cluster badge, not a legacy clusterId badge', () => {
    render(
      <MemoryRouter>
        <NarrativeStream />
      </MemoryRouter>,
    );
    const row = screen.getByTestId('stream-row-it.002');
    expect(row.textContent ?? '').toMatch(/confirmed cluster · 2 members/);

    expect(row.textContent ?? '').not.toMatch(/cluster:cl\./);
  });

  it('News Room shows a Confirmed cluster section (confirmedMemberCount), not legacy item counts', () => {
    render(
      <MemoryRouter initialEntries={['/newsroom/it.002']}>
        <Routes>
          <Route path="/newsroom/:itemId" element={<NewsRoom />} />
        </Routes>
      </MemoryRouter>,
    );
    const section = screen.getByTestId('newsroom-confirmed-cluster');
    expect(section.textContent ?? '').toMatch(/2 confirmed members \(cluster-rule-v1\)/);

    expect(document.body.textContent ?? '').not.toMatch(/Linked cluster/);
  });

  it('World Radar no longer renders a legacy "N clusters" count', () => {
    const { container } = render(
      <MemoryRouter>
        <WorldRadar />
      </MemoryRouter>,
    );
    expect(container.textContent ?? '').not.toMatch(/\d+\s+clusters/);
  });

  it('Morning Brief major-clusters lines use confirmed member counts', () => {
    const { container } = render(
      <MemoryRouter>
        <MorningBrief />
      </MemoryRouter>,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/confirmed members \(cluster-rule-v1\)/);
  });
});
