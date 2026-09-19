import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '@/pages/Dashboard';
import NarrativeStream from '@/pages/NarrativeStream';
import NewsTimeline from '@/pages/NewsTimeline';
import MorningBriefPage from '@/pages/MorningBrief';
import WorldRadar from '@/pages/WorldRadar';
import NewsRoom from '@/pages/NewsRoom';
import SourceRegistry from '@/pages/SourceRegistry';
import Ingestion from '@/pages/Ingestion';
import Calendar from '@/pages/Calendar';
import Clusters from '@/pages/Clusters';

const FORBIDDEN_PRODUCT_SCOPE =
  /\b(market awareness|MT5 collector|liquidity room|Feature Engine|Event Engine|Setup State Machine|real DQS)\b/i;

const FORBIDDEN_MARKET_STATE =
  /\b(gold is calm|dxy is bid|s&p is weak|risk appetite fading|under pressure|bearish|bullish|market is waiting|dollar pressure rising)\b/i;

const FORBIDDEN_TRADE_ACTIONS =
  /\b(buy now|sell now|go long|go short|enter trade|enter the trade|execute order|trade signal|buy signal|sell signal)\b/i;

const surfaces: Array<[string, () => JSX.Element]> = [
  ['Dashboard', () => <Dashboard />],
  ['NarrativeStream', () => <NarrativeStream />],
  ['NewsTimeline', () => <NewsTimeline />],
  ['MorningBrief', () => <MorningBriefPage />],
  ['WorldRadar', () => <WorldRadar />],
  ['NewsRoom', () => <NewsRoom />],
  ['SourceRegistry', () => <SourceRegistry />],
  ['Ingestion', () => <Ingestion />],
  ['Calendar', () => <Calendar />],
  ['Clusters', () => <Clusters />],
];

describe('12. no forbidden product-scope phrases or market-state inference in active UI copy', () => {
  for (const [name, Element] of surfaces) {
    it(`${name} surface contains no forbidden phrases`, () => {
      const { container } = render(
        <MemoryRouter>
          <Element />
        </MemoryRouter>,
      );
      const text = container.textContent ?? '';
      expect(text).not.toMatch(FORBIDDEN_PRODUCT_SCOPE);
      expect(text).not.toMatch(FORBIDDEN_MARKET_STATE);
      expect(text).not.toMatch(FORBIDDEN_TRADE_ACTIONS);
    });
  }
});
