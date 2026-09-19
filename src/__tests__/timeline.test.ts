import { describe, expect, it } from 'vitest';
import { FIXTURE_SNAPSHOT } from '@/fixtures/snapshot';

describe('7. sourceEventTime and observedAt remain separate', () => {
  it('schema preserves three distinct timestamp fields', () => {
    for (const it of FIXTURE_SNAPSHOT.items) {
      expect(it).toHaveProperty('sourceEventTime');
      expect(it).toHaveProperty('observedAt');
      expect(it).toHaveProperty('ingestedAt');
    }
  });

  it('at least one fixture item has sourceEventTime != observedAt to keep them genuinely distinct', () => {
    const distinct = FIXTURE_SNAPSHOT.items.filter((i) => i.sourceEventTime !== i.observedAt);
    expect(distinct.length).toBeGreaterThan(0);
  });
});
