import type { SourceFetchRequest } from './types';

export type FetchTransportResultKind =
  | 'success'
  | 'timeout'
  | 'http_error'
  | 'unsupported_content_type'
  | 'oversized'
  | 'malformed'
  | 'empty'
  | 'unavailable';

export interface FetchTransportResult {
  kind: FetchTransportResultKind;
  httpStatus?: number;
  contentType?: string;
  payloadText?: string;

  byteLength?: number;
}

export interface OfflineFetchTransport {
  readonly transportId: string;

  read(request: SourceFetchRequest): FetchTransportResult;
}

export class RecordedFixtureFetchTransport implements OfflineFetchTransport {
  readonly transportId = 'recorded-fixture-transport';
  constructor(private readonly recorded: Readonly<Record<string, FetchTransportResult>>) {}
  read(request: SourceFetchRequest): FetchTransportResult {
    return this.recorded[request.sourceId] ?? { kind: 'unavailable' };
  }
}

export class FakeFetchTransport implements OfflineFetchTransport {
  readonly transportId = 'fake-transport';
  constructor(private readonly result: FetchTransportResult) {}
  read(_request: SourceFetchRequest): FetchTransportResult {
    void _request;
    return this.result;
  }
}

export class ErroringFetchTransport implements OfflineFetchTransport {
  readonly transportId = 'erroring-transport';
  constructor(private readonly message = 'simulated transport error') {}
  read(_request: SourceFetchRequest): FetchTransportResult {
    void _request;
    throw new Error(this.message);
  }
}
