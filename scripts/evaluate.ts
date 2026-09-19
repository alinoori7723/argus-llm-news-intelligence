import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ingestDataset } from '../pipeline/ingest';
import { FixtureProvider } from '../pipeline/providers/fixture';
import { OUTPUT_SCHEMA, PROMPT_TEXT, PROMPT_HASH } from '../pipeline/prompt';
import { summarySchema } from '../pipeline/contracts';
import { validateSummary, VALIDATOR_VERSION } from '../pipeline/validate';
import { validationCases } from '../pipeline/eval-cases';

const snapshot = ingestDataset(JSON.parse(readFileSync('samples/news-dataset.json', 'utf8')));
const cluster = snapshot.clusters[0];
const items = snapshot.items.filter((item) => cluster.itemIds.includes(item.itemId));
const valid = summarySchema.parse(
  (
    await new FixtureProvider().generate({
      snapshotId: snapshot.id,
      cluster,
      items,
      instructions: PROMPT_TEXT,
      schema: OUTPUT_SCHEMA,
      maxOutputTokens: 1200,
    })
  ).output,
);
const cases = validationCases(valid, items).map((test) => {
  const actual = validateSummary(test.candidate, items).output ? 'accepted' : 'rejected';
  return { name: test.name, expected: test.expected, actual, passed: actual === test.expected };
});
const report = {
  suite: 'mechanical-validation-v1',
  scope: 'Contract and evidence validation only; not a model factuality benchmark.',
  validatorVersion: VALIDATOR_VERSION,
  promptHash: PROMPT_HASH,
  datasetHash: snapshot.datasetHash,
  total: cases.length,
  passed: cases.filter((test) => test.passed).length,
  falseAccepts: cases.filter((test) => test.expected === 'rejected' && test.actual === 'accepted')
    .length,
  falseRejects: cases.filter((test) => test.expected === 'accepted' && test.actual === 'rejected')
    .length,
  cases,
};
mkdirSync('.argus/evals', { recursive: true });
writeFileSync('.argus/evals/validation.json', `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.passed !== report.total) process.exitCode = 1;
