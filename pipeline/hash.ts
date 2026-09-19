import { createHash } from 'node:crypto';
import type { RunArtifact } from './contracts';

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Cannot hash undefined');
  return encoded;
}

export const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');
export const contentHash = (value: unknown): string => sha256(canonicalJson(value));

export function semanticRunHash(run: Pick<RunArtifact, 'snapshot' | 'generations'>): string {
  return contentHash({
    snapshot: run.snapshot,
    generations: run.generations.map(
      ({ telemetry: _telemetry, responseId: _responseId, ...generation }) => generation,
    ),
  });
}
