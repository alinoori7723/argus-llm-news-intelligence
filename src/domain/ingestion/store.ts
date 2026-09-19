import type {
  IngestionRun,
  IngestionStore,
  MalformedSourceItem,
  NormalizedIngestedItem,
  RawSourcePayload,
} from './types';

export class AppendOnlyIngestionStore implements IngestionStore {
  private readonly rawPayloadsList: RawSourcePayload[] = [];
  private readonly normalizedItemsList: NormalizedIngestedItem[] = [];
  private readonly malformedItemsList: MalformedSourceItem[] = [];
  private readonly runsList: IngestionRun[] = [];
  private seq = 0;

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  appendRawPayload(payload: RawSourcePayload): void {
    this.rawPayloadsList.push(payload);
  }

  appendNormalizedItems(items: NormalizedIngestedItem[]): void {
    this.normalizedItemsList.push(...items);
  }

  appendMalformedItems(items: MalformedSourceItem[]): void {
    this.malformedItemsList.push(...items);
  }

  recordRun(run: IngestionRun): void {
    this.runsList.push(run);
  }

  get rawPayloads(): readonly RawSourcePayload[] {
    return [...this.rawPayloadsList];
  }
  get normalizedItems(): readonly NormalizedIngestedItem[] {
    return [...this.normalizedItemsList];
  }
  get malformedItems(): readonly MalformedSourceItem[] {
    return [...this.malformedItemsList];
  }
  get runs(): readonly IngestionRun[] {
    return [...this.runsList];
  }

  rawPayloadsForSource(sourceId: string): readonly RawSourcePayload[] {
    return this.rawPayloadsList.filter((p) => p.sourceId === sourceId);
  }
}
