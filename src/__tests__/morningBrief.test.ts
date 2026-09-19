import { describe, expect, it } from 'vitest';
import { buildMorningBrief } from '@/domain/morningBrief';
import { FIXTURE_SNAPSHOT, FIXTURE_NOW } from '@/fixtures/snapshot';

describe('10. Morning Brief does not contain trade recommendation language', () => {
  const brief = buildMorningBrief(FIXTURE_SNAPSHOT, FIXTURE_NOW);
  const allLines = brief.sections.flatMap((s) => s.lines).concat([brief.intro]);
  const joined = allLines.join('\n');

  it('contains no buy/sell/long/short/enter/execute action labels', () => {
    const forbidden =
      /\b(buy now|sell now|go long|go short|enter trade|enter the trade|execute order|trade signal|buy signal|sell signal)\b/i;
    expect(joined).not.toMatch(forbidden);
  });

  it('contains no inferred market-state phrases', () => {
    const forbidden =
      /\b(gold is calm|dxy is bid|s&p is weak|risk appetite fading|under pressure|bearish|bullish|market is waiting|dollar pressure rising)\b/i;
    expect(joined).not.toMatch(forbidden);
  });

  it('exposes the six required sections', () => {
    const headings = brief.sections.map((s) => s.heading);
    expect(headings).toEqual([
      'Scheduled events',
      'Major source-backed clusters',
      'Relevant watched assets / topics',
      'Unverified / rumor / needs review (inspection only)',
      'Items worth attention',
      'Items to ignore unless they escalate',
    ]);
  });
});
