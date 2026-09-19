import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Clusters from '@/pages/Clusters';
import { CLUSTER_A_ID } from '@/fixtures/clustering/clusterScenario';

const renderClusters = () =>
  render(
    <MemoryRouter>
      <Clusters />
    </MemoryRouter>,
  );

describe('10. cluster evidence / reason display', () => {
  it('shows the confirmed cluster with member count, source count, and rule version', () => {
    renderClusters();
    const cluster = screen.getByTestId(`cluster-${CLUSTER_A_ID}`);
    expect(cluster.getAttribute('data-member-count')).toBe('4');
    expect(cluster.getAttribute('data-source-count')).toBe('4');
    expect(cluster.getAttribute('data-rule-version')).toBe('cluster-rule-v1');
    expect(cluster.getAttribute('data-cluster-status')).toBe('corrected');
  });

  it('shows a per-member inclusion reason', () => {
    renderClusters();
    const cluster = screen.getByTestId(`cluster-${CLUSTER_A_ID}`);
    const a3 = within(cluster).getByTestId('cluster-member-it.a3');
    expect(a3.getAttribute('data-reason-type')).toBe('dedupe_hash_exact');
    const a2 = within(cluster).getByTestId('cluster-member-it.a2');
    expect(a2.getAttribute('data-reason-type')).toBe('canonical_url_exact');
  });

  it('shows the correction history for the removed member', () => {
    renderClusters();
    expect(screen.getByTestId('cluster-correction-it.a4')).toBeInTheDocument();
  });

  it('lists similar-but-different items as kept-separate (not merged)', () => {
    renderClusters();
    const unmerged = screen.getByTestId('clusters-unmerged');
    expect(within(unmerged).getByTestId('unmerged-it.n1')).toBeInTheDocument();
    expect(within(unmerged).getByTestId('unmerged-it.n2')).toBeInTheDocument();

    expect(
      within(screen.getByTestId(`cluster-${CLUSTER_A_ID}`)).queryByTestId('cluster-member-it.a4'),
    ).toBeNull();
  });
});
