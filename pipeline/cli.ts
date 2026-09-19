import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { FixtureProvider } from './providers/fixture';
import { OpenAIProvider } from './providers/openai';
import { runPipeline } from './run';
import { RequestBudget } from './pricing';
import { verifyRun, writeRun } from './storage';

async function main() {
  const { values } = parseArgs({
    options: {
      provider: { type: 'string', default: 'fixture' },
      input: { type: 'string', default: 'samples/news-dataset.json' },
      out: { type: 'string', default: '.argus/runs' },
      verify: { type: 'string' },
      demo: { type: 'boolean', default: false },
    },
  });
  if (values.verify) {
    const run = verifyRun(resolve(values.verify));
    process.stdout.write(`Verified ${run.runId}\nSemantic hash: ${run.semanticHash}\n`);
    return;
  }
  if (!['fixture', 'openai'].includes(values.provider))
    throw new Error('Provider must be fixture or openai');
  if (values.demo && values.provider !== 'fixture')
    throw new Error('Public demo generation only accepts the synthetic fixture provider');
  const text = readFileSync(resolve(values.input), 'utf8');
  if (Buffer.byteLength(text, 'utf8') > 1_000_000) throw new Error('Dataset exceeds 1 MB');
  const provider =
    values.provider === 'openai'
      ? new OpenAIProvider(process.env.OPENAI_API_KEY ?? '', {
          model: process.env.OPENAI_MODEL,
          budget: new RequestBudget(Number(process.env.ARGUS_MAX_COST_USD ?? '0.10')),
        })
      : new FixtureProvider();
  const run = await runPipeline(JSON.parse(text), provider, {
    runId: `run-${randomUUID()}`,
    now: () => new Date(),
    timer: () => performance.now(),
  });
  const path = writeRun(resolve(values.out), run);
  verifyRun(path);
  if (values.demo) {
    if (!run.snapshot.dataset.synthetic)
      throw new Error('The public demo requires a synthetic dataset');
    mkdirSync('src/fixtures/intelligence', { recursive: true });
    writeFileSync('src/fixtures/intelligence/demo-run.json', `${JSON.stringify(run, null, 2)}\n`);
  }
  process.stdout.write(
    `${JSON.stringify({ runId: run.runId, mode: run.mode, semanticHash: run.semanticHash, ...run.telemetry, artifact: path }, null, 2)}\n`,
  );
  if (run.telemetry.rejected > 0) process.exitCode = 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Pipeline failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
