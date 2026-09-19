import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sample from '../samples/news-dataset.json';
import { runPipeline } from './run';
import { FixtureProvider } from './providers/fixture';
import { verifyRun, writeRun } from './storage';

const directories: string[] = [];
afterEach(() =>
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })),
);
async function prepare() {
  const root = mkdtempSync(join(tmpdir(), 'argus-audit-'));
  directories.push(root);
  const run = await runPipeline(sample, new FixtureProvider(), {
    runId: 'test-run',
    now: () => new Date('2026-09-19T12:00:00Z'),
    timer: () => 1,
  });
  return { run, root, path: writeRun(root, run) };
}
describe('exclusive audit storage', () => {
  it('round trips a run and a ledger with matching lineage', async () => {
    const { run, path } = await prepare();
    expect(verifyRun(path)).toEqual(run);
  });
  it('refuses to overwrite an existing run', async () => {
    const { run, root } = await prepare();
    expect(() => writeRun(root, run)).toThrow();
  });
  it('detects tampered artifact contents', async () => {
    const { path } = await prepare();
    writeFileSync(join(path, 'run.json'), '{}');
    expect(() => verifyRun(path)).toThrow('integrity');
  });
  it('detects a truncated ledger', async () => {
    const { path } = await prepare();
    const events = readFileSync(join(path, 'events.jsonl'), 'utf8').trim().split('\n');
    writeFileSync(join(path, 'events.jsonl'), `${events.slice(0, -1).join('\n')}\n`);
    expect(() => verifyRun(path)).toThrow('integrity');
  });
  it('rejects a run id that escapes the output directory', async () => {
    const { run, root } = await prepare();
    expect(() => writeRun(root, { ...run, runId: '../escape' })).toThrow('Invalid run id');
  });
  it('checks semantic identity even when file and ledger checksums are consistent', async () => {
    const { run, root } = await prepare();
    const path = writeRun(root, {
      ...run,
      runId: 'incorrect-semantic-hash',
      semanticHash: '0'.repeat(64),
    });
    expect(() => verifyRun(path)).toThrow('semantic identity');
  });
});
