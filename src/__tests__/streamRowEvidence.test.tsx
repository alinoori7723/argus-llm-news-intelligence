import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StreamRow } from '@/components/StreamRow';
import type { AnnotatedItem } from '@/domain/selectors';
import type { ExternalItem, SourceProfile } from '@/domain/types';

const NOW = new Date('2026-05-28T13:00:00.000Z');

const source: SourceProfile = {
  sourceId: 'src.test',
  name: 'Test Source',
  sourceType: 'public_headline_fixture',
  accessMethod: 'static-fixture-json',
  legalStatus: 'allowed',
  enabled: true,
  sourceTier: 'reputable',
  trustNotes: '',
  freshnessExpectation: '',
  defaultAssetTags: [],
  defaultTopicTags: [],
};

const baseItem: ExternalItem = {
  itemId: 'it.test',
  sourceId: 'src.test',
  sourceItemId: 'src-item-test',
  sourceEventTime: NOW.toISOString(),
  observedAt: NOW.toISOString(),
  ingestedAt: NOW.toISOString(),
  title: 'Test headline',
  excerpt: 'Test excerpt',
  language: 'en',
  tags: [],
  verificationTier: 'reported',
  freshnessState: 'live',
  dedupeHash: 'h.test',
};

const annotate = (item: ExternalItem): AnnotatedItem => ({
  item,
  source,
  priority: {
    priorityTier: 'P2',
    urgencyLabel: 'today',
    priorityReason: 'test',
  },
  confirmedMemberCount: 1,
});

const renderRow = (item: ExternalItem) =>
  render(
    <MemoryRouter>
      <StreamRow ai={annotate(item)} now={NOW} />
    </MemoryRouter>,
  );

describe('StreamRow evidence/reference fallback chain', () => {
  it('renders url as evidence when url is available', () => {
    const { container } = renderRow({
      ...baseItem,
      url: 'https://example.invalid/evidence',
    });
    const ev = container.querySelector('[data-testid^="stream-row-evidence-"]')!;
    expect(ev.getAttribute('data-evidence-kind')).toBe('url');
    expect(ev.textContent).toMatch(/evidence \(url\):/);
    expect(ev.querySelector('a')!.getAttribute('href')).toBe('https://example.invalid/evidence');
  });

  it('renders sourceItemId as evidence when url is absent', () => {
    const { container } = renderRow({
      ...baseItem,
      url: undefined,
      sourceItemId: 'src-item-test',
    });
    const ev = container.querySelector('[data-testid^="stream-row-evidence-"]')!;
    expect(ev.getAttribute('data-evidence-kind')).toBe('sourceItemId');
    expect(ev.textContent).toMatch(/evidence \(sourceItemId\):\s*src-item-test/);
  });

  it('renders itemId as the internal fallback when both url and sourceItemId are absent', () => {
    const { container } = renderRow({
      ...baseItem,
      url: undefined,
      sourceItemId: '',
    });
    const ev = container.querySelector('[data-testid^="stream-row-evidence-"]')!;
    expect(ev.getAttribute('data-evidence-kind')).toBe('itemId');
    expect(ev.textContent).toMatch(/evidence \(itemId\):\s*it\.test/);
  });
});
