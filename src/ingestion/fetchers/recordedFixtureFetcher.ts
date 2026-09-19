import type { FetchContext, FetchOutcome, SourceFetcher } from '@/domain/ingestion';
import type { SourceProfile } from '@/domain/types';

export interface RecordedPayload {
  xml: string;
  contentType?: string;
  sourceUrl?: string;
}

export class RecordedFixtureFetcher implements SourceFetcher {
  readonly fetcherVersion = 'recorded-fixture-fetcher-v1';

  private readonly bySource: Map<string, RecordedPayload>;

  constructor(payloads: Record<string, RecordedPayload>) {
    this.bySource = new Map(Object.entries(payloads));
  }

  async fetch(source: SourceProfile, _ctx: FetchContext): Promise<FetchOutcome> {
    const recorded = this.bySource.get(source.sourceId);
    if (!recorded) {
      return {
        status: 'failed',
        failureReason: `no recorded payload for source ${source.sourceId}`,
      };
    }
    return {
      status: 'fetched',
      payloadText: recorded.xml,
      contentType: recorded.contentType ?? 'application/rss+xml',
      sourceUrl: recorded.sourceUrl,
    };
  }
}
