import type { FixtureSnapshot } from '@/domain/types';
import { FIXTURE_SOURCES } from './sources';
import { FIXTURE_ITEMS, FIXTURE_NOW } from './items';
import { FIXTURE_CLUSTERS } from './clusters';

export const FIXTURE_SNAPSHOT: FixtureSnapshot = {
  generatedAt: FIXTURE_NOW.toISOString(),
  sources: FIXTURE_SOURCES,
  items: FIXTURE_ITEMS,
  clusters: FIXTURE_CLUSTERS,
};

export { FIXTURE_NOW };
