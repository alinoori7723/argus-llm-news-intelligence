import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SourceRegistry from '@/pages/SourceRegistry';

const eligibility = (sourceId: string) =>
  screen.getByTestId(`source-row-${sourceId}`).getAttribute('data-ingestion-eligibility');

describe('Source Registry shows Phase 2.1 ingestion eligibility', () => {
  it('classifies each source by enabled + legalStatus + supported type', () => {
    render(
      <MemoryRouter>
        <SourceRegistry />
      </MemoryRouter>,
    );

    expect(eligibility('src.rss.fixture.geo')).toBe('eligible');

    expect(eligibility('src.social.placeholder')).toBe('quarantined');

    expect(eligibility('src.scraper.disabled')).toBe('disabled');

    expect(eligibility('src.econ.cal.fixture')).toBe('unsupported');
  });

  it('renders a visible ingestion-eligibility label for each source', () => {
    render(
      <MemoryRouter>
        <SourceRegistry />
      </MemoryRouter>,
    );
    const review = screen.getByTestId('source-row-src.social.placeholder');
    expect(review.textContent ?? '').toMatch(/ingest: quarantined/i);
  });
});
