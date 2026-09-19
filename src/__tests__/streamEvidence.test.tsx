import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NarrativeStream from '@/pages/NarrativeStream';
import NewsRoom from '@/pages/NewsRoom';
import { FIXTURE_SNAPSHOT } from '@/fixtures/snapshot';
import { promotableAnnotatedItems } from '@/domain/selectors';

describe('Narrative Stream renders evidence/reference for every visible row', () => {
  it('every visible row carries an evidence (url | sourceItemId | itemId) field', () => {
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
      const kind = ev!.getAttribute('data-evidence-kind');
      expect(['url', 'sourceItemId', 'itemId']).toContain(kind);
      expect(ev!.textContent).toMatch(/evidence \((url|sourceItemId|itemId)\):/);
    }
  });

  it('every promotable row carries a traceable evidence/reference value', () => {
    const annotated = promotableAnnotatedItems(
      FIXTURE_SNAPSHOT,
      new Date(FIXTURE_SNAPSHOT.generatedAt),
    );
    render(
      <MemoryRouter>
        <NarrativeStream />
      </MemoryRouter>,
    );
    for (const a of annotated) {
      const row = screen.getByTestId(`stream-row-${a.item.itemId}`);
      const kind = row.getAttribute('data-evidence-kind');
      const value = row.getAttribute('data-evidence-value');
      expect(kind).toBeTruthy();
      expect(value).toBeTruthy();

      const expected = a.item.url ?? a.item.sourceItemId ?? a.item.itemId;
      expect(value).toBe(expected);
    }
  });
});

const renderNewsRoom = (itemId: string) =>
  render(
    <MemoryRouter initialEntries={[`/newsroom/${itemId}`]}>
      <Routes>
        <Route path="/newsroom/:itemId" element={<NewsRoom />} />
      </Routes>
    </MemoryRouter>,
  );

describe('News Room detail renders fallback reference fields even when url is absent', () => {
  it('shows itemId, sourceItemId, sourceId, verificationTier when url is missing', () => {
    renderNewsRoom('it.018');
    const ref = screen.getByTestId('newsroom-reference');
    expect(ref.querySelector('[data-field="itemId"]')!.textContent).toMatch(/itemId:\s*it\.018/);
    expect(ref.querySelector('[data-field="sourceItemId"]')!.textContent).toMatch(
      /sourceItemId:\s*curated-llm-tag-demo/,
    );
    expect(ref.querySelector('[data-field="sourceId"]')!.textContent).toMatch(
      /sourceId:\s*src\.curated\.fixture/,
    );
    expect(ref.querySelector('[data-field="verificationTier"]')!.textContent).toMatch(
      /verificationTier:\s*reported/,
    );

    expect(ref.querySelector('[data-field="url-absent"]')).not.toBeNull();
    expect(ref.querySelector('[data-field="url"]')).toBeNull();
  });

  it('shows url field when present', () => {
    renderNewsRoom('it.001');
    const ref = screen.getByTestId('newsroom-reference');
    expect(ref.querySelector('[data-field="url"]')).not.toBeNull();
    expect(ref.querySelector('[data-field="url-absent"]')).toBeNull();
  });
});
