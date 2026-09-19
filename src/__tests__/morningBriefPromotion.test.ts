import { describe, expect, it } from 'vitest';
import { buildMorningBrief } from '@/domain/morningBrief';
import { FIXTURE_SNAPSHOT, FIXTURE_NOW } from '@/fixtures/snapshot';

describe('Morning Brief promoted sections exclude needs_review', () => {
  const brief = buildMorningBrief(FIXTURE_SNAPSHOT, FIXTURE_NOW);

  const promotedHeadings = new Set([
    'Scheduled events',
    'Major source-backed clusters',
    'Relevant watched assets / topics',
    'Items worth attention',
  ]);

  const needsReviewSourceNames = FIXTURE_SNAPSHOT.sources
    .filter((s) => s.legalStatus === 'needs_review')
    .map((s) => s.name);

  it('no needs_review source name appears in any promoted section', () => {
    for (const sec of brief.sections) {
      if (!promotedHeadings.has(sec.heading)) continue;
      for (const line of sec.lines) {
        for (const name of needsReviewSourceNames) {
          expect(line).not.toContain(name);
        }
      }
    }
  });

  it('needs_review item it.013 is not in promoted scheduled / attention / watched lines', () => {
    const promotedLines = brief.sections
      .filter((s) => promotedHeadings.has(s.heading))
      .flatMap((s) => s.lines);
    const joined = promotedLines.join('\n');
    expect(joined).not.toContain('Unverified social-style claim (rumor)');
  });

  it('inspection-only section may include needs_review items but only labeled', () => {
    const inspection = brief.sections.find((s) => s.heading.toLowerCase().includes('inspection'));
    expect(inspection).toBeDefined();

    const line = inspection!.lines.find((l) => l.includes('Unverified social-style claim (rumor)'));
    expect(line).toBeDefined();
    expect(line!.toLowerCase()).toContain('needs review');
  });
});
