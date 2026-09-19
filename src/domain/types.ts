export type SourceType =
  | 'economic_calendar'
  | 'economic_calendar_fixture'
  | 'rss_fixture'
  | 'public_headline_fixture'
  | 'open_news_dataset_fixture'
  | 'user_curated_fixture'
  | 'official_social_api_placeholder'
  | 'manual_input';

export type LegalStatus = 'allowed' | 'needs_review' | 'disabled';

export type SourceTier = 'primary' | 'reputable' | 'curated' | 'unknown' | 'experimental';

export type TagType = 'asset' | 'topic' | 'region' | 'macro' | 'source_keyword';

export type TagProvenance = 'deterministic' | 'llm_suggested' | 'user_confirmed';

export interface Tag {
  tagId: string;
  tagType: TagType;
  tagValue: string;
  provenance: TagProvenance;
}

export interface SourceProfile {
  sourceId: string;
  name: string;
  sourceType: SourceType;
  accessMethod: string;
  legalStatus: LegalStatus;
  enabled: boolean;
  sourceTier: SourceTier;
  trustNotes: string;
  freshnessExpectation: string;
  defaultAssetTags: string[];
  defaultTopicTags: string[];
}

export type VerificationTier = 'verified' | 'reported' | 'unverified' | 'rumor' | 'scheduled';

export type FreshnessState = 'live' | 'delayed' | 'stale' | 'disconnected' | 'unknown';

export interface ExternalItem {
  itemId: string;
  sourceId: string;
  sourceItemId: string;

  sourceEventTime: string;

  observedAt: string;

  ingestedAt: string;
  normalizedAt?: string;
  title: string;
  excerpt: string;
  url?: string;
  authorOrPublisher?: string;
  language: string;
  tags: Tag[];
  verificationTier: VerificationTier;
  freshnessState: FreshnessState;

  dedupeHash: string;
  clusterId?: string;
}

export type PriorityTier = 'P0' | 'P1' | 'P2' | 'P3' | 'muted';

export type UrgencyLabel = 'now' | 'soon' | 'today' | 'background' | 'muted';

export interface SourceCluster {
  clusterId: string;
  title: string;
  firstObservedAt: string;
  lastObservedAt: string;
  itemIds: string[];
  sourceCount: number;
  itemCount: number;
  highestSourceTier: SourceTier;
  verificationTier: VerificationTier;
  priorityTier: PriorityTier;
  urgencyLabel: UrgencyLabel;
  priorityReason: string;
  tags: Tag[];
}

export interface FixtureSnapshot {
  generatedAt: string;
  sources: SourceProfile[];
  items: ExternalItem[];
  clusters: SourceCluster[];
}
