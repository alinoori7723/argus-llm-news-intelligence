import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Ingestion from '@/pages/Ingestion';

const run = (sourceId: string) => screen.getByTestId(`ingestion-run-${sourceId}`);

describe('Ingestion diagnostics page (recorded-fixture, deterministic)', () => {
  it('shows skipped runs with a skip reason for needs_review and disabled sources', () => {
    render(
      <MemoryRouter>
        <Ingestion />
      </MemoryRouter>,
    );
    const review = run('src.rss.review');
    expect(review.getAttribute('data-status')).toBe('skipped');
    expect(review.getAttribute('data-skip-reason')).toBe('legal_status_needs_review');

    const disabled = run('src.rss.disabled');
    expect(disabled.getAttribute('data-status')).toBe('skipped');
    expect(disabled.getAttribute('data-skip-reason')).toBe('legal_status_disabled');
  });

  it('shows a successful run with parserVersion for the clean feed', () => {
    render(
      <MemoryRouter>
        <Ingestion />
      </MemoryRouter>,
    );
    const clean = run('src.rss.clean');
    expect(clean.getAttribute('data-status')).toBe('success');
    expect(clean.getAttribute('data-parser-version')).toBe('rss-parser-v1');
    expect(Number(clean.getAttribute('data-normalized-count'))).toBeGreaterThanOrEqual(5);
  });

  it('shows a partial_success run with warnings + malformed count for the malformed feed', () => {
    render(
      <MemoryRouter>
        <Ingestion />
      </MemoryRouter>,
    );
    const malformed = run('src.rss.malformed');
    expect(malformed.getAttribute('data-status')).toBe('partial_success');
    expect(Number(malformed.getAttribute('data-warning-count'))).toBeGreaterThan(0);
    expect(Number(malformed.getAttribute('data-malformed-count'))).toBeGreaterThan(0);
    expect(malformed.getAttribute('data-parser-version')).toBe('rss-parser-v1');
  });
});
