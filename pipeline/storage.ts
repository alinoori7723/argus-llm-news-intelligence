import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunArtifact } from './contracts';
import { canonicalJson, contentHash, semanticRunHash, sha256 } from './hash';

export type AuditEvent = {
  sequence: number;
  type: string;
  payload: unknown;
  previousHash: string | null;
  hash: string;
};

export function buildAuditEvents(run: RunArtifact): AuditEvent[] {
  const inputs = [
    { type: 'snapshot', payload: { id: run.snapshot.id, sha256: run.snapshot.datasetHash } },
    ...run.snapshot.rawPayloads.map((payload) => ({ type: 'raw_payload', payload })),
    ...run.snapshot.items.map((payload) => ({ type: 'normalized_item', payload })),
    ...run.snapshot.quarantined.map((payload) => ({ type: 'quarantined_item', payload })),
    ...run.snapshot.decisions.map((payload) => ({ type: 'dedupe_decision', payload })),
    ...run.snapshot.clusters.map((payload) => ({ type: 'cluster', payload })),
    ...run.generations.map((payload) => ({ type: 'generation', payload })),
  ];
  const events: AuditEvent[] = [];
  for (const input of inputs) {
    const record = { sequence: events.length, ...input, previousHash: events.at(-1)?.hash ?? null };
    events.push({ ...record, hash: contentHash(record) });
  }
  return events;
}

export function writeRun(root: string, run: RunArtifact): string {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(run.runId)) throw new Error('Invalid run id');
  mkdirSync(root, { recursive: true });
  const directory = join(root, run.runId);
  mkdirSync(directory);
  const artifact = `${JSON.stringify(run, null, 2)}\n`;
  const events = buildAuditEvents(run);
  const ledger = `${events.map(canonicalJson).join('\n')}\n`;
  writeFileSync(join(directory, 'run.json'), artifact, { flag: 'wx' });
  writeFileSync(join(directory, 'events.jsonl'), ledger, { flag: 'wx' });
  writeFileSync(
    join(directory, 'manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 'audit-manifest-v1',
        runId: run.runId,
        artifactSha256: sha256(artifact),
        ledgerSha256: sha256(ledger),
        eventCount: events.length,
        finalEventHash: events.at(-1)!.hash,
      },
      null,
      2,
    ),
    { flag: 'wx' },
  );
  return directory;
}

export function verifyRun(directory: string): RunArtifact {
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  const artifact = readFileSync(join(directory, 'run.json'), 'utf8');
  const ledger = readFileSync(join(directory, 'events.jsonl'), 'utf8');
  if (manifest.artifactSha256 !== sha256(artifact) || manifest.ledgerSha256 !== sha256(ledger))
    throw new Error('Audit file integrity mismatch');
  const run = JSON.parse(artifact) as RunArtifact;
  if (semanticRunHash(run) !== run.semanticHash) throw new Error('Run semantic identity mismatch');
  if (manifest.schemaVersion !== 'audit-manifest-v1' || manifest.runId !== run.runId)
    throw new Error('Manifest identity mismatch');
  const events = ledger
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as AuditEvent);
  for (const [index, event] of events.entries()) {
    const { hash, ...record } = event;
    if (
      event.sequence !== index ||
      event.previousHash !== (events[index - 1]?.hash ?? null) ||
      contentHash(record) !== hash
    )
      throw new Error('Audit chain is broken');
  }
  if (events.length !== manifest.eventCount || events.at(-1)?.hash !== manifest.finalEventHash)
    throw new Error('Audit ledger is truncated');
  if (canonicalJson(events) !== canonicalJson(buildAuditEvents(run)))
    throw new Error('Ledger does not describe the run');
  return run;
}
