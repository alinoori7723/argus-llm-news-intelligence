import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SourceRegistry from '@/pages/SourceRegistry';
import { FIXTURE_SOURCES } from '@/fixtures/sources';

describe('11. Source Registry exposes legalStatus and sourceTier', () => {
  it('every fixture source row exposes both legalStatus and sourceTier in the DOM', () => {
    render(
      <MemoryRouter>
        <SourceRegistry />
      </MemoryRouter>,
    );
    for (const s of FIXTURE_SOURCES) {
      const row = screen.getByTestId(`source-row-${s.sourceId}`);
      expect(row.getAttribute('data-legal-status')).toBe(s.legalStatus);
      expect(row.getAttribute('data-source-tier')).toBe(s.sourceTier);
    }
  });

  it('disabled and needs_review sources render with distinguishing classes', () => {
    render(
      <MemoryRouter>
        <SourceRegistry />
      </MemoryRouter>,
    );
    const disabled = FIXTURE_SOURCES.find((s) => s.legalStatus === 'disabled')!;
    const review = FIXTURE_SOURCES.find((s) => s.legalStatus === 'needs_review')!;
    expect(screen.getByTestId(`source-row-${disabled.sourceId}`).className).toMatch(
      /opacity|alert/,
    );
    expect(screen.getByTestId(`source-row-${review.sourceId}`).className).toMatch(/warn/);
  });
});
