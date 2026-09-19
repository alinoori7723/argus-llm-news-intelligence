import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Clusters from '@/pages/Clusters';
import MorningBriefPage from '@/pages/MorningBrief';
import { buildMorningBrief, MAJOR_CLUSTERS_HEADING } from '@/domain/morningBrief';
import * as format from '@/domain/format';
import { CLUSTER_A_ID } from '@/fixtures/clustering/clusterScenario';
import type { ExternalItem, FixtureSnapshot, SourceProfile } from '@/domain/types';

const srcFile = (rel: string) =>
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', rel), 'utf8');

describe('1. Clusters visible badges come from ConfirmedClusterDisplay', () => {
  it('renders member/source counts (behavior)', () => {
    render(
      <MemoryRouter>
        <Clusters />
      </MemoryRouter>,
    );
    const cluster = screen.getByTestId(`cluster-${CLUSTER_A_ID}`);
    expect(within(cluster).getByText('members: 4')).toBeInTheDocument();
    expect(within(cluster).getByText('sources: 4')).toBeInTheDocument();
  });

  it('visible member/source badges read from the display object', () => {
    const code = srcFile('pages/Clusters.tsx');
    expect(code).toMatch(/disp\.confirmedMemberCount/);
    expect(code).toMatch(/disp\.sourceCount/);
  });

  it('has NO raw-count fallback in Clusters visible UI (would fail if fallback returns)', () => {
    const code = srcFile('pages/Clusters.tsx');
    expect(code).not.toMatch(/\?\?\s*c\.confirmedMemberCount/);
    expect(code).not.toMatch(/\?\?\s*c\.sourceCount/);

    expect(code).not.toMatch(/c\.confirmedMemberCount/);
    expect(code).not.toMatch(/c\.sourceCount/);
  });

  it('renders an explicit non-count placeholder when no display model exists', () => {
    const code = srcFile('pages/Clusters.tsx');
    expect(code).toMatch(/members:\s*\{disp \? disp\.confirmedMemberCount : /);
    expect(code).toMatch(/sources:\s*\{disp \? disp\.sourceCount : /);
  });
});

const reportedItem = (over: Partial<ExternalItem>): ExternalItem => ({
  itemId: 'it.x',
  sourceId: 'src.a',
  sourceItemId: 'evt-x',
  sourceEventTime: '2026-05-31T11:00:00.000Z',
  observedAt: '2026-05-31T11:50:00.000Z',
  ingestedAt: '2026-05-31T11:50:00.000Z',
  title: 'Headline',
  excerpt: '',
  url: 'https://h/x',
  language: 'en',
  tags: [],
  verificationTier: 'reported',
  freshnessState: 'live',
  dedupeHash: 'h.x',
  ...over,
});

const allowedSource = (id: string): SourceProfile => ({
  sourceId: id,
  name: id,
  sourceType: 'rss_fixture',
  accessMethod: 'recorded',
  legalStatus: 'allowed',
  enabled: true,
  sourceTier: 'reputable',
  trustNotes: '',
  freshnessExpectation: '',
  defaultAssetTags: [],
  defaultTopicTags: [],
});

describe('2. Morning Brief major clusters use confirmedMemberCount, not legacy itemCount', () => {
  const now = new Date('2026-05-31T12:00:00.000Z');

  const snapshot: FixtureSnapshot = {
    generatedAt: now.toISOString(),
    sources: [allowedSource('src.a'), allowedSource('src.b')],
    items: [
      reportedItem({
        itemId: 'it.m1',
        sourceId: 'src.a',
        dedupeHash: 'h.match',
        url: 'https://h/m1',
      }),
      reportedItem({
        itemId: 'it.m2',
        sourceId: 'src.b',
        dedupeHash: 'h.match',
        url: 'https://h/m2',
      }),
    ],
    clusters: [
      {
        clusterId: 'cl.legacy',
        title: 'Legacy',
        firstObservedAt: now.toISOString(),
        lastObservedAt: now.toISOString(),
        itemIds: ['it.m1', 'it.m2'],
        sourceCount: 99,
        itemCount: 99,
        highestSourceTier: 'primary',
        verificationTier: 'reported',
        priorityTier: 'P0',
        urgencyLabel: 'now',
        priorityReason: 'legacy',
        tags: [],
      },
    ],
  };

  it('typed majorClusters carry confirmedMemberCount (2), never the legacy 99', () => {
    const brief = buildMorningBrief(snapshot, now);
    expect(brief.majorClusters).toHaveLength(1);
    expect(brief.majorClusters[0].confirmedMemberCount).toBe(2);
    expect(brief.majorClusters[0].clusterRuleVersion).toBe('cluster-rule-v1');

    const major = brief.sections.find((s) => s.heading === MAJOR_CLUSTERS_HEADING)!;
    const text = major.lines.join(' ');
    expect(text).toMatch(/2 confirmed members \(cluster-rule-v1\)/);
    expect(text).not.toMatch(/99/);
  });

  it('the page renders typed cluster rows (count + sourceCount + rule version)', () => {
    render(
      <MemoryRouter>
        <MorningBriefPage />
      </MemoryRouter>,
    );
    const section = screen.getByTestId('brief-major-clusters');
    const rows = section.querySelectorAll('[data-testid^="brief-cluster-"]');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of Array.from(rows)) {
      expect(row.getAttribute('data-confirmed-member-count')).toBeTruthy();
      expect(row.getAttribute('data-source-count')).toBeTruthy();
      expect(row.getAttribute('data-rule-version')).toBe('cluster-rule-v1');
      expect(row.textContent ?? '').toMatch(/confirmed members \(cluster-rule-v1\)/);
    }
  });

  it('morningBrief domain builds typed rows via buildConfirmedClusterDisplay (no ad hoc string bypass)', () => {
    const code = srcFile('domain/morningBrief.ts');
    expect(code).toMatch(/buildConfirmedClusterDisplay/);
    expect(code).not.toMatch(/\.itemCount/);
  });
});

describe('3. legacy clusterShortLabel is removed', () => {
  it('is not exported by the format module', () => {
    expect('clusterShortLabel' in format).toBe(false);
  });

  it('no source file references clusterShortLabel', () => {
    expect(srcFile('domain/format.ts')).not.toMatch(/clusterShortLabel/);
    expect(srcFile('components/StreamRow.tsx')).not.toMatch(/clusterShortLabel/);
    expect(srcFile('pages/NewsRoom.tsx')).not.toMatch(/clusterShortLabel/);
  });
});
