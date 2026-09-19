import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NewsRoom from '@/pages/NewsRoom';
import { FIXTURE_SNAPSHOT } from '@/fixtures/snapshot';

const renderNewsRoom = (itemId: string) =>
  render(
    <MemoryRouter initialEntries={[`/newsroom/${itemId}`]}>
      <Routes>
        <Route path="/newsroom/:itemId" element={<NewsRoom />} />
      </Routes>
    </MemoryRouter>,
  );

const field = (container: HTMLElement, name: string) =>
  container.querySelector(`[data-field="${name}"]`);

const provenancesIn = (article: HTMLElement): string[] =>
  Array.from(article.querySelectorAll('[title^="provenance:"]'))
    .map((el) => el.getAttribute('title') ?? '')
    .map((t) => t.replace('provenance: ', ''));

describe('News Room detail renders every required reference field', () => {
  it('shows url, sourceItemId, itemId, sourceId, clusterId, verificationTier for a clustered item with a url', () => {
    const item = FIXTURE_SNAPSHOT.items.find((i) => i.itemId === 'it.001')!;
    expect(item.clusterId).toBeTruthy();

    renderNewsRoom('it.001');
    const ref = screen.getByTestId('newsroom-reference');

    const urlField = field(ref, 'url')!;
    expect(urlField).not.toBeNull();
    expect(urlField.querySelector('a')!.getAttribute('href')).toBe(item.url);
    expect(field(ref, 'url-absent')).toBeNull();

    expect(field(ref, 'sourceItemId')!.textContent).toMatch(
      /sourceItemId:\s*evt-powell-2026-05-28/,
    );
    expect(field(ref, 'itemId')!.textContent).toMatch(/itemId:\s*it\.001/);
    expect(field(ref, 'sourceId')!.textContent).toMatch(/sourceId:\s*src\.econ\.cal\.fixture/);

    expect(field(ref, 'clusterId')!.textContent).toMatch(/clusterId:\s*cl\.powell\.remarks/);

    expect(field(ref, 'verificationTier')!.textContent).toMatch(/verificationTier:\s*scheduled/);
  });

  it('shows priorityReason text', () => {
    renderNewsRoom('it.001');
    const reason = screen
      .getByTestId('newsroom-item')
      .querySelector('[data-field="priorityReason"]')!;
    expect(reason).not.toBeNull();

    expect(reason.textContent ?? '').toMatch(/source tier/);
    expect(reason.textContent ?? '').toMatch(/verification/);
    expect((reason.textContent ?? '').trim().length).toBeGreaterThan(0);
  });

  it('shows the three distinct timestamps (sourceEventTime, observedAt, ingestedAt)', () => {
    renderNewsRoom('it.001');
    const article = screen.getByTestId('newsroom-item');
    for (const name of ['sourceEventTime', 'observedAt', 'ingestedAt']) {
      const el = field(article, name)!;
      expect(el).not.toBeNull();

      expect(el.textContent ?? '').toMatch(new RegExp(`${name}:\\s*\\d{4}-\\d{2}-\\d{2}`));
    }
  });

  it('renders deterministic tag provenance', () => {
    renderNewsRoom('it.001');
    const article = screen.getByTestId('newsroom-item');
    const provs = provenancesIn(article);
    expect(provs.length).toBeGreaterThan(0);
    expect(provs).toContain('deterministic');

    expect(article.textContent ?? '').toMatch(/· deterministic/);
  });
});

describe('News Room detail covers user_confirmed and llm_suggested provenance', () => {
  it('renders user_confirmed provenance (it.009, curated allowed source) and its clusterId', () => {
    const item = FIXTURE_SNAPSHOT.items.find((i) => i.itemId === 'it.009')!;
    expect(item.tags.some((t) => t.provenance === 'user_confirmed')).toBe(true);

    renderNewsRoom('it.009');
    const article = screen.getByTestId('newsroom-item');
    expect(provenancesIn(article)).toContain('user_confirmed');
    expect(article.textContent ?? '').toMatch(/· user_confirmed/);

    expect(field(article, 'clusterId')!.textContent).toMatch(/clusterId:\s*cl\.me\.geo/);
  });

  it('renders llm_suggested provenance for display (it.018) without it affecting priority', () => {
    const item = FIXTURE_SNAPSHOT.items.find((i) => i.itemId === 'it.018')!;
    expect(item.tags.some((t) => t.provenance === 'llm_suggested')).toBe(true);

    renderNewsRoom('it.018');
    const article = screen.getByTestId('newsroom-item');
    const provs = provenancesIn(article);

    expect(provs).toContain('llm_suggested');
    expect(provs).toContain('deterministic');
    expect(article.textContent ?? '').toMatch(/· llm_suggested/);
  });
});

describe('News Room detail fallback when url is absent', () => {
  it('still shows sourceItemId, itemId, sourceId, verificationTier and the url-absent indicator (it.018)', () => {
    const item = FIXTURE_SNAPSHOT.items.find((i) => i.itemId === 'it.018')!;
    expect(item.url).toBeUndefined();

    renderNewsRoom('it.018');
    const ref = screen.getByTestId('newsroom-reference');
    expect(field(ref, 'url')).toBeNull();
    expect(field(ref, 'url-absent')).not.toBeNull();
    expect(field(ref, 'sourceItemId')!.textContent).toMatch(/sourceItemId:\s*curated-llm-tag-demo/);
    expect(field(ref, 'itemId')!.textContent).toMatch(/itemId:\s*it\.018/);
    expect(field(ref, 'sourceId')!.textContent).toMatch(/sourceId:\s*src\.curated\.fixture/);
    expect(field(ref, 'verificationTier')!.textContent).toMatch(/verificationTier:\s*reported/);

    expect(field(ref, 'clusterId')).toBeNull();

    const article = screen.getByTestId('newsroom-item');
    for (const name of ['sourceEventTime', 'observedAt', 'ingestedAt']) {
      expect(field(article, name)).not.toBeNull();
    }
    expect(field(article, 'priorityReason')).not.toBeNull();
  });
});
