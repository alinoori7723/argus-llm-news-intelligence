# Showcase dataset

`news-dataset.json` is a hand-constructed, fictional dataset created for this repository. Organization names, figures, timestamps, and articles are synthetic. All publisher links use reserved `.example` domains. No credentials, personal records, customer data, or scraped paywalled content are included.

The sample exercises four stories with exact duplicates, one missing publication timestamp, a source awaiting review, and a disabled source. It is small enough to inspect completely before running the pipeline.

| Input                   | Count |
| ----------------------- | ----: |
| Source definitions      |     6 |
| Article records         |    12 |
| Ingested articles       |    10 |
| Quarantined articles    |     2 |
| Exact-identity clusters |     5 |
| Eligible clusters       |     4 |

The dataset is dedicated to the public domain under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). This dedication applies to the fictional showcase dataset, not to third-party recorded parser fixtures elsewhere in the repository.

Use `pipeline/contracts.ts` as the executable dataset specification. Source permission flags are explicit input decisions, not a licensing determination performed by Argus.
