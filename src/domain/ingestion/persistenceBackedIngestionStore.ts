import { deepClone, deepFreeze, type AppendOnlyPersistenceStore } from '../persistence';
import type {
  IngestionRun,
  IngestionStore,
  MalformedSourceItem,
  NormalizedIngestedItem,
  RawSourcePayload,
} from './types';
import {
  mapMalformedItemToInput,
  mapNormalizedItemToInput,
  mapRawPayloadToInput,
  mapRunToInput,
} from './ingestionPersistenceMapping';
import {
  INGESTION_MALFORMED_ITEMS_STREAM,
  INGESTION_NORMALIZED_ITEMS_STREAM,
  INGESTION_RAW_PAYLOADS_STREAM,
  INGESTION_RUNS_STREAM,
} from './ingestionPersistenceStreams';

export class PersistenceBackedIngestionStore implements IngestionStore {
  private seq = 0;

  constructor(private readonly store: AppendOnlyPersistenceStore) {}

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  appendRawPayload(payload: RawSourcePayload): void {
    const streamSequence = this.store.readStream(INGESTION_RAW_PAYLOADS_STREAM).length;
    this.store.append(mapRawPayloadToInput(payload, streamSequence));
  }

  appendNormalizedItems(items: NormalizedIngestedItem[]): void {
    if (items.length === 0) return;

    const base = this.store.readStream(INGESTION_NORMALIZED_ITEMS_STREAM).length;
    this.store.appendBatch(items.map((item, i) => mapNormalizedItemToInput(item, base + i)));
  }

  appendMalformedItems(items: MalformedSourceItem[]): void {
    if (items.length === 0) return;
    const base = this.store.readStream(INGESTION_MALFORMED_ITEMS_STREAM).length;
    this.store.appendBatch(items.map((item, i) => mapMalformedItemToInput(item, base + i)));
  }

  recordRun(run: IngestionRun): void {
    const streamSequence = this.store.readStream(INGESTION_RUNS_STREAM).length;
    this.store.append(mapRunToInput(run, streamSequence));
  }

  private read<T>(streamName: string): readonly T[] {
    return Object.freeze(
      this.store.readStream(streamName).map((r) => deepFreeze(deepClone(r.payload)) as T),
    );
  }

  get rawPayloads(): readonly RawSourcePayload[] {
    return this.read<RawSourcePayload>(INGESTION_RAW_PAYLOADS_STREAM);
  }
  get normalizedItems(): readonly NormalizedIngestedItem[] {
    return this.read<NormalizedIngestedItem>(INGESTION_NORMALIZED_ITEMS_STREAM);
  }
  get malformedItems(): readonly MalformedSourceItem[] {
    return this.read<MalformedSourceItem>(INGESTION_MALFORMED_ITEMS_STREAM);
  }
  get runs(): readonly IngestionRun[] {
    return this.read<IngestionRun>(INGESTION_RUNS_STREAM);
  }

  rawPayloadsForSource(sourceId: string): readonly RawSourcePayload[] {
    return Object.freeze(
      this.store
        .readStream(INGESTION_RAW_PAYLOADS_STREAM, sourceId)
        .map((r) => deepFreeze(deepClone(r.payload)) as RawSourcePayload),
    );
  }
}
