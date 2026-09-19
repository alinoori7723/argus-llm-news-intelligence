# Reproducibility

## Replay the committed sample

```bash
pnpm install --frozen-lockfile
pnpm pipeline:replay
pnpm demo:verify
pnpm eval
```

`demo:verify` executes the fixture pipeline again and compares its semantic hash with `src/fixtures/intelligence/demo-run.json`. It fails if the pipeline, prompt, schema, data, or accepted fixture output drifts. The committed run is a real local execution of the offline provider.

The dataset contains 12 records. Two source gates quarantine input before raw storage. Ten normalized records become five exact-identity clusters. Four clusters produce accepted fixture summaries. The undated cluster is skipped. Eight claim citations point to verbatim evidence.

## Stable and variable fields

| Stable for the same fixture input and implementation | Variable per execution                     |
| ---------------------------------------------------- | ------------------------------------------ |
| Canonical dataset hash                               | Run UUID                                   |
| Normalized records and source lineage                | Run creation timestamp                     |
| Cluster membership and match decisions               | Measured stage durations                   |
| Prompt, schema, model, and input identities          | Provider attempt metadata                  |
| Fixture output and validation results                | Live provider response IDs and live output |
| Semantic hash for a fixture replay                   | Provider latency and observed token usage  |

The semantic hash covers the snapshot and generation records without timing, usage, request-attempt telemetry, or provider response IDs. It includes model identity, raw output, validation results, and prompt/schema identities. It is not a promise that a live LLM will produce identical output. Temperature 0 and a pinned model improve comparability but do not establish deterministic generation.

## Verify a stored run

Use the path printed by the replay command:

```bash
pnpm pipeline:verify --verify .argus/runs/<run-id>
```

Verification checks artifact and ledger hashes, sequence numbers, previous-event hashes, event count, final hash, run identity, and agreement between the artifact and reconstructed events. Tests cover file modification, truncation, and attempts to overwrite a run directory.

The manifest is stored beside the data and is not signed. An actor who rewrites the artifact, event chain, and manifest can create a new consistent directory. External signatures or an independently retained digest are necessary for authenticity claims.

## Refresh the public demo

```bash
pnpm demo:generate
pnpm demo:verify
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Review the fixture JSON and generated screenshots before committing. The demo command accepts only fixture mode and a dataset marked synthetic. That flag is a declaration, not an automatic privacy detector. Never mark private data synthetic to publish it.

The browser bundle includes the entire committed demo artifact. Files under `.argus/` and `.env.local` are ignored by Git. Live output is never copied into the browser by `pipeline:live`.
