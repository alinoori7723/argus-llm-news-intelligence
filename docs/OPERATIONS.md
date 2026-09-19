# Operations

## Runtime

The supported development and CI baseline is Node.js 24 with pnpm 11.19.0. The web application is a static React build. The ingestion/generation pipeline runs as a separate Node CLI and writes local files.

```bash
pnpm pipeline:replay --input samples/news-dataset.json --out .argus/runs
pnpm pipeline:live --input samples/news-dataset.json --out .argus/runs
```

The dataset schema permits up to 32 sources and 128 articles, bounded text fields, HTTPS source references, unique identities, and explicit publication times or null. CLI input is capped at 1 MB. URLs in a dataset are references; the pipeline does not fetch them.

## Credentials and cost

Create `.env.local` from `.env.example`. Node loads it only for the live command. Do not prefix a key with `VITE_`: that would make it eligible for browser bundling. Do not place credentials in a dataset, issue, screenshot, or run artifact.

| Setting              | Default                   | Meaning                                                           |
| -------------------- | ------------------------- | ----------------------------------------------------------------- |
| `OPENAI_API_KEY`     | Required for live mode    | Provider credential, sent only in the authorization header        |
| `OPENAI_MODEL`       | `gpt-4.1-mini-2025-04-14` | Requested model snapshot                                          |
| `ARGUS_MAX_COST_USD` | `0.10`                    | Client request reservation ceiling; greater than 0 and at most 10 |

The price table is versioned and dated in `pipeline/pricing.ts`. It uses published input, cached-input, and output rates for the supported model. [Official model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini) and the [structured output guide](https://developers.openai.com/api/docs/guides/structured-outputs) describe the underlying API.

Before every attempt, the client reserves an estimated upper allowance using request bytes plus a token-overhead margin and the maximum output size. This conservative local control is not a provider billing limit or an invoice guarantee. Unknown models are rejected before a paid request until their price mapping is explicitly added. Reported usage drives the post-request cost estimate. Missing usage or unpriced returned models stay unknown, not zero.

## Request and failure behavior

| Condition                                   | Behavior                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| HTTP 429 or 5xx                             | Up to 3 attempts total; bounded exponential wait; each attempt recorded            |
| Other non-2xx status                        | Reject immediately; do not retain a possibly sensitive response body               |
| Timeout or network error                    | Reject without retry because the remote execution/billing outcome may be ambiguous |
| Provider refusal or incomplete response     | Reject and retain request/usage metadata when available                            |
| Invalid JSON, schema, citation, or evidence | Reject; retain model output for inspection when available                          |
| Unknown or future publication time          | Skip the entire affected cluster before requesting generation                      |
| Unhandled provider exception                | Sanitize the exception and record rejection                                        |

Requests have a 30-second timeout, a 1,200-token output ceiling, redirects disabled, no model tools, and `store: false`. This parameter does not supersede the provider's data-handling terms. Source text is untrusted input. Application-level validation remains mandatory even with strict structured output.

The live command exits nonzero when any generation is rejected. A rejected run is still written and verified for diagnosis. Errors never trigger a fixture fallback. Usage totals become unknown when any attempted request has unknown usage; individual known usage is preserved in the attempt records.

## Publication

GitHub Pages serves only `dist/`. The quality workflow runs all checks before deploying main. The build uses a repository-specific base path and hash routes. The API key is unnecessary in CI and must not be configured as a frontend build variable.

Public artifacts are deliberately synthetic. Local runs, environment files, original design documents, and private working notes are excluded from version control. Review `git diff --cached` before any release.
