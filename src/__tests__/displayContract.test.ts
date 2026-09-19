import { describe, expect, it } from 'vitest';
import {
  buildAuditLinkDisplay,
  buildCalendarConfirmationDisplay,
  buildConfirmedClusterDisplay,
  buildEvidenceDisplay,
  buildFreshnessDisplay,
  buildItemDisplay,
  buildPriorityDisplay,
  buildVerificationDisplay,
} from '@/domain/display';
import { calendarEventViews, currentRevisions, toCalendarEventView } from '@/domain/calendar';
import {
  buildCleanCalendarStore,
  buildRichCalendarStore,
  viewNow,
} from '@/fixtures/calendar/demoCalendar';
import type { ConfirmedCluster } from '@/domain/clustering';
import type { ExternalItem } from '@/domain/types';

const item = (over: Partial<ExternalItem>): ExternalItem => ({
  itemId: 'it.x',
  sourceId: 'src.a',
  sourceItemId: 'evt-x',
  sourceEventTime: '2026-05-31T11:00:00.000Z',
  observedAt: '2026-05-31T11:50:00.000Z',
  ingestedAt: '2026-05-31T11:55:00.000Z',
  normalizedAt: '2026-05-31T11:56:00.000Z',
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

const cluster = (over: Partial<ConfirmedCluster> = {}): ConfirmedCluster => ({
  clusterId: 'ccl-it.1',
  clusterTitle: 'fed holds rates',
  clusterStatus: 'active',
  firstObservedAt: '',
  lastObservedAt: '',
  confirmedMemberItemIds: ['it.1', 'it.2'],
  confirmedMemberCount: 2,
  sourceCount: 2,
  sourceIds: ['src.a', 'src.b'],
  clusterRuleVersion: 'cluster-rule-v1',
  createdAt: '',
  derivedUpdatedAt: '',
  ...over,
});

describe('EvidenceDisplay (shared)', () => {
  it('prefers url, then sourceItemId, then itemId', () => {
    expect(buildEvidenceDisplay(item({ url: 'https://h/y' }))).toMatchObject({
      referenceType: 'url',
      isExternal: true,
      href: 'https://h/y',
    });
    expect(buildEvidenceDisplay(item({ url: undefined, sourceItemId: 'evt-1' }))).toMatchObject({
      referenceType: 'sourceItemId',
      isExternal: false,
    });
    expect(
      buildEvidenceDisplay(item({ url: undefined, sourceItemId: '', itemId: 'it.z' })),
    ).toMatchObject({ referenceType: 'itemId', referenceValue: 'it.z' });
  });
});

describe('VerificationDisplay (shared)', () => {
  it('maps caution + promotion eligibility per tier', () => {
    expect(buildVerificationDisplay('rumor')).toMatchObject({
      cautionLevel: 'high',
      mayPromoteHighAttention: false,
    });
    expect(buildVerificationDisplay('unverified')).toMatchObject({
      cautionLevel: 'medium',
      mayPromoteHighAttention: false,
    });
    expect(buildVerificationDisplay('reported').mayPromoteHighAttention).toBe(true);
    expect(buildVerificationDisplay('verified').cautionLevel).toBe('none');
  });
});

describe('FreshnessDisplay (shared)', () => {
  it('carries timestamps and a caveat only for non-live states', () => {
    expect(buildFreshnessDisplay(item({ freshnessState: 'live' })).caveat).toBeUndefined();
    expect(buildFreshnessDisplay(item({ freshnessState: 'stale' })).caveat).toMatch(/stale/);
    const f = buildFreshnessDisplay(item({}));
    expect(f.observedAt).toBeTruthy();
    expect(f.ingestedAt).toBeTruthy();
    expect(f.normalizedAt).toBeTruthy();
  });
});

describe('ConfirmedClusterDisplay (shared)', () => {
  it('is null for unclustered / size < 2', () => {
    expect(buildConfirmedClusterDisplay(undefined)).toBeNull();
    expect(buildConfirmedClusterDisplay(cluster({ confirmedMemberCount: 1 }))).toBeNull();
  });

  it('exposes confirmedMemberCount, sourceCount, rule version, detail link, and a confirmed label', () => {
    const d = buildConfirmedClusterDisplay(cluster())!;
    expect(d.confirmedMemberCount).toBe(2);
    expect(d.sourceCount).toBe(2);
    expect(d.clusterRuleVersion).toBe('cluster-rule-v1');
    expect(d.detailHref).toBe('/clusters');
    expect(d.label.toLowerCase()).toContain('confirmed');
    expect(d.label.toLowerCase()).not.toContain('semantic');
  });

  it('reports correction count', () => {
    expect(
      buildConfirmedClusterDisplay(cluster({ clusterStatus: 'corrected' }))!.correctionCount,
    ).toBe(1);
    expect(buildConfirmedClusterDisplay(cluster(), { correctionCount: 3 })!.correctionCount).toBe(
      3,
    );
  });
});

describe('PriorityDisplay (shared)', () => {
  it('splits deterministic inputs and flags confirmed-cluster influence', () => {
    const d = buildPriorityDisplay(
      {
        priorityTier: 'P0',
        urgencyLabel: 'now',
        priorityReason:
          'source tier primary (+3); confirmed cluster ccl-it.1 size 2 (cluster-rule-v1)',
      },
      buildConfirmedClusterDisplay(cluster()),
    );
    expect(d.deterministicInputs.length).toBe(2);
    expect(d.usesConfirmedCluster).toBe(true);
    expect(d.clusterRuleVersion).toBe('cluster-rule-v1');
  });

  it('does not flag cluster influence when there is no confirmed cluster', () => {
    const d = buildPriorityDisplay(
      { priorityTier: 'P2', urgencyLabel: 'today', priorityReason: 'source tier reputable (+2)' },
      null,
    );
    expect(d.usesConfirmedCluster).toBe(false);
    expect(d.clusterRuleVersion).toBeUndefined();
  });
});

describe('CalendarConfirmationDisplay (shared)', () => {
  it('fresh confirmation → promotable, no caveat', () => {
    const views = calendarEventViews(buildCleanCalendarStore(), viewNow());
    const view = views.find((v) => v.confirmationState === 'fresh')!;
    const d = buildCalendarConfirmationDisplay(view);
    expect(d.confirmationCaveat).toBeUndefined();
    expect(d.scheduledFor).toBeTruthy();
  });

  it('stale confirmation → caveat + cannot promote high-attention', () => {
    const store = buildRichCalendarStore();
    const stale = currentRevisions(store)
      .map((r) => toCalendarEventView(store, r, viewNow()))
      .find((v) => v.confirmationState === 'stale')!;
    const d = buildCalendarConfirmationDisplay(stale);
    expect(d.confirmationCaveat).toMatch(/stale|needs confirmation/i);
    expect(d.canPromoteHighAttention).toBe(false);
  });
});

describe('AuditLinkDisplay (shared)', () => {
  it('maps target types to routes', () => {
    expect(buildAuditLinkDisplay('news_item', 'it.5')).toMatchObject({
      href: '/newsroom/it.5',
      targetType: 'news_item',
    });
    expect(buildAuditLinkDisplay('cluster').href).toBe('/clusters');
    expect(buildAuditLinkDisplay('calendar_event').href).toBe('/calendar');
    expect(buildAuditLinkDisplay('raw_payload').href).toBe('/ingestion');
  });
});

describe('buildItemDisplay (composite)', () => {
  it('assembles all sub-displays consistently', () => {
    const d = buildItemDisplay({
      item: item({ itemId: 'it.q', verificationTier: 'rumor', freshnessState: 'stale' }),
      priority: { priorityTier: 'P3', urgencyLabel: 'background', priorityReason: 'x' },
      confirmedCluster: cluster({
        clusterId: 'ccl-it.q',
        confirmedMemberItemIds: ['it.q', 'it.r'],
      }),
    });
    expect(d.verification.cautionLevel).toBe('high');
    expect(d.freshness.caveat).toMatch(/stale/);
    expect(d.cluster?.confirmedMemberCount).toBe(2);
    expect(d.auditLink.href).toBe('/newsroom/it.q');
    expect(d.evidence.referenceType).toBe('url');
  });
});
