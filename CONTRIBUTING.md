# Contributing

Use Node.js 24 and the pnpm version pinned in `package.json`. Install with the frozen lockfile, then run `pnpm check`. Browser changes should also pass `pnpm test:e2e` against the production build.

Keep deterministic domain rules separate from providers and presentation. Preserve injected clocks, explicit source eligibility, immutable projections, and the distinction between publication time and observation time. Provider changes need failure-path tests as well as a successful response case.

When changing a prompt, schema, or processing rule, review its version, regenerate the synthetic demo, verify its semantic hash, and explain changes in expected output. Evaluation claims must name the dataset and distinguish offline tests from live provider evidence.

Use descriptive names and small functions. Keep implementation rationale in `docs/` and behavior in tests. Format changes with `pnpm format`. Do not commit `.env.local`, `.argus/`, private inputs, or credentials. Screenshots must come from the running application.
