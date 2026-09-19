# Dependency maintenance

Routine version updates arrive weekly in at most two open PRs: one npm minor/patch group and one GitHub Actions group. Both require review and a successful `quality` check on the reviewed head. Grouping is a queue policy, not an automatic merge rule.

Major application and toolchain updates are handled as deliberate migrations. The npm `allow.update-types` restriction applies to version updates; it does not suppress security updates. CI also checks dependency advisories. Follow the [GitHub configuration reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference) when changing this policy.

Keep Dependabot security updates enabled. Security fixes use a separate PR queue and still require review and successful CI before merging.

## Review record: 2026-09-19

| PR                                                                                                   | Decision                        | Evidence and compatibility review                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#1](https://github.com/alinoori7723/argus-llm-news-intelligence/pull/1) · deploy-pages 5.0.1        | Accepted after successful PR CI | Official release SHA verified. The action runtime moves to Node 24, supported by the hosted runner. Deployment itself is verified on main because PR CI skips publishing.                                                                 |
| [#2](https://github.com/alinoori7723/argus-llm-news-intelligence/pull/2) · setup-node 7.0.0          | Accepted after successful PR CI | Explicit `cache: pnpm` avoids the automatic-cache behavior change in v6. The workflow does not publish npm packages or depend on the removed dummy authentication token. Official release SHA verified.                                   |
| [#3](https://github.com/alinoori7723/argus-llm-news-intelligence/pull/3) · checkout 7.0.1            | Accepted after successful PR CI | Hosted runner supports the action runtime. The workflow uses ordinary `pull_request` events and does not execute fork code through privileged `pull_request_target` or `workflow_run` events. Official release SHA verified.              |
| [#4](https://github.com/alinoori7723/argus-llm-news-intelligence/pull/4) · upload-artifact 7.0.1     | Accepted after successful PR CI | Existing multi-file uploads retain the default archive mode. The new direct single-file upload option is not enabled. Official release SHA verified.                                                                                      |
| [#5](https://github.com/alinoori7723/argus-llm-news-intelligence/pull/5) · Playwright 1.63.0         | Accepted after successful PR CI | Update is limited to the test runner and its lockfile graph. Node 24 and the hosted Ubuntu image meet its requirements. All five Chromium journeys pass with the updated browser.                                                         |
| [#6](https://github.com/alinoori7723/argus-llm-news-intelligence/pull/6) · TypeScript 6.0.3          | Deferred                        | CI fails with TS5101 on `baseUrl`. A migration should remove the deprecated option, make path mappings explicit, and run the complete suite rather than suppress the diagnostic.                                                          |
| [#7](https://github.com/alinoori7723/argus-llm-news-intelligence/pull/7) · React 19                  | Deferred                        | CI fails with TS2503 on the global `JSX` namespace. The proposed update also leaves `@types/react-dom` on 18. Review React, React DOM, both type packages, JSX types, and rendering behavior together.                                    |
| [#8](https://github.com/alinoori7723/argus-llm-news-intelligence/pull/8) · Node types 26             | Deferred despite green CI       | The tested runtime baseline is Node 24. Types for Node 26 can expose APIs unavailable at that baseline. Align the type package with the runtime and CI matrix before changing this major version.                                         |
| [#9](https://github.com/alinoori7723/argus-llm-news-intelligence/pull/9) · zod-to-json-schema 3.25.2 | Accepted after successful PR CI | Zod remains pinned to 3.25.76, within the new peer range. Schema conversion, provider validation, deterministic replay, and all five browser journeys pass in CI.                                                                         |
| [#10](https://github.com/alinoori7723/argus-llm-news-intelligence/pull/10) · pnpm/action-setup 4.3.0 | Accepted after successful PR CI | Official v4.3.0 release SHA verified. pnpm stays pinned to 11.19.0; action-level caching defaults to false, so setup-node remains the cache owner. Resolved workflow conflicts against main, then verified the resulting PR head with CI. |

Deferred PRs are closed without merging and retain their review history. A future migration can reference the original proposal and this record. Deferral is not evidence that the current version is permanently preferred or that future security updates should wait.

## Review sources

- [deploy-pages v5](https://github.com/actions/deploy-pages/releases/tag/v5.0.0) and [v5.0.1](https://github.com/actions/deploy-pages/releases/tag/v5.0.1)
- [setup-node v6](https://github.com/actions/setup-node/releases/tag/v6.0.0) and [v7](https://github.com/actions/setup-node/releases/tag/v7.0.0)
- [checkout v6](https://github.com/actions/checkout/releases/tag/v6.0.0) and [v7](https://github.com/actions/checkout/releases/tag/v7.0.0)
- [upload-artifact v6](https://github.com/actions/upload-artifact/releases/tag/v6.0.0) and [v7](https://github.com/actions/upload-artifact/releases/tag/v7.0.0)
- [Playwright 1.63](https://github.com/microsoft/playwright/releases/tag/v1.63.0)
- [React 19 migration guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [zod-to-json-schema changelog](https://github.com/StefanTerdell/zod-to-json-schema/blob/master/changelog.md)
- [pnpm/action-setup v4.3.0](https://github.com/pnpm/action-setup/releases/tag/v4.3.0)
