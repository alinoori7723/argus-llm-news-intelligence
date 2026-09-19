# Evaluation

Argus separates reproducibility, contract validation, provider integration tests, and model quality. Passing one does not establish the others.

## Evidence available in this repository

| Layer                     | What is checked                                                                                                                                     | What it does not establish                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Deterministic ingestion   | Stable ordering, exact identities, source gates, timestamp handling, raw hashes, transitive clusters                                                | General feed compatibility or source truth      |
| Validator cases           | 18 hand-built cases: accepted examples plus malformed schema, unknown citations, altered quotes, unsupported numbers, and prohibited action phrases | Accuracy on an independent news corpus          |
| Provider contract         | Structured request shape, retries, timeouts, refusals, incomplete output, malformed responses, usage accounting, budget gate                        | A successful call to a live model account       |
| Audit storage             | Round-trip verification, overwrite prevention, modified files, truncated ledgers, invalid run IDs                                                   | Authentication against a full-directory rewrite |
| Domain and UI regressions | Source eligibility, time and priority rules, append-only projections, calendar revisions, cluster reasons, attention state and rendered evidence    | Production throughput or a persistent backend   |
| Browser journeys          | Citation inspection, quarantine filtering, prompt/output audit, runtime labeling, mobile navigation                                                 | Cross-browser accessibility certification       |

## Reproduce validation results

```bash
pnpm eval
```

The command writes `.argus/evals/validation.json` with case IDs, expected and observed acceptance, false accepts/rejects, validator version, dataset hash, and prompt/schema hashes. These cases are also exercised by the test suite. They are an implementation regression set, not a held-out benchmark. No model-quality percentage is inferred from them.

## Tests and coverage

```bash
pnpm test
pnpm test:coverage
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Coverage includes `pipeline/**/*.ts` except test files and CLI argument wiring. Existing `src/domain` and component regressions run in the same command, but are outside this coverage report. Provider tests inject HTTP responses and require no secrets. Browser tests run the built app in Chromium and capture the public screenshots.

CI uploads coverage, the validation report, and browser results. Treat the current workflow result as the authoritative check status rather than a manually maintained test-count badge.

## Live-model evaluation still needed

The public fixture run contains zero LLM calls. A meaningful live evaluation should use a separately curated, permissioned dataset with human labels for supported claims, contradictions, important omissions, citation precision, and appropriate abstention. Report prompt/model revisions, dataset identity, token usage, retry costs, latency distribution, and failure rates across repeated runs.

Exact evidence spans can coexist with misleading paraphrases. Numeric presence can coexist with wrong units or relationships. Those cases require semantic review beyond the current validator. No factuality, news coverage, trading performance, or production latency claim is made by the demo.
