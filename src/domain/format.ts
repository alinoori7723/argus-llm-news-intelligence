import type { ExternalItem, Tag } from './types';

export const ageLabel = (iso: string, now: Date): string => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unknown';
  const diffMin = Math.max(0, Math.floor((now.getTime() - t) / 60_000));
  if (diffMin < 1) return 'live';
  if (diffMin < 60) return `${diffMin}m`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

export const pulseSummaryLine = (
  label: string,
  itemsOrClusters: { count: number; lastObservedAt?: string },
  now: Date,
): string => {
  const { count, lastObservedAt } = itemsOrClusters;
  const age = lastObservedAt ? ageLabel(lastObservedAt, now) : 'no major source update';
  if (count === 0) {
    return `${label}: no major source update · ${age}`;
  }
  return `${label}: ${count} related headlines · ${age}`;
};

export const tagBadgeText = (tag: Tag): string => `${tag.tagType}:${tag.tagValue}`;

export const formatTimestamp = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
};

export const itemDisplayTime = (item: ExternalItem): string => formatTimestamp(item.observedAt);
