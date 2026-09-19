import { readFileSync } from 'node:fs';
import { runPipeline } from '../pipeline/run';
import { FixtureProvider } from '../pipeline/providers/fixture';
import type { RunArtifact } from '../pipeline/contracts';
import { semanticRunHash } from '../pipeline/hash';

const sample = JSON.parse(readFileSync('samples/news-dataset.json', 'utf8'));
const committed = JSON.parse(
  readFileSync('src/fixtures/intelligence/demo-run.json', 'utf8'),
) as RunArtifact;
if (semanticRunHash(committed) !== committed.semanticHash)
  throw new Error('The committed demo contents do not match their claimed semantic identity.');
if (committed.mode !== 'fixture' || !committed.snapshot.dataset.synthetic)
  throw new Error('The public demo must be a synthetic fixture run.');
const replay = await runPipeline(sample, new FixtureProvider(), {
  runId: 'verification-run',
  now: () => new Date(committed.createdAt),
  timer: () => performance.now(),
});
if (committed.semanticHash !== replay.semanticHash)
  throw new Error(
    'Demo drift: regenerate the demo after reviewing dataset, prompt, schema, or pipeline changes.',
  );
if (replay.telemetry.rejected) throw new Error('The replay contains rejected output.');
process.stdout.write(`Demo semantic hash verified: ${replay.semanticHash}\n`);
