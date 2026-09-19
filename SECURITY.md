# Security

Please report a vulnerability using GitHub's private vulnerability reporting feature on this repository. Do not include credentials or private source data in a public issue.

The live provider belongs to the Node CLI. The static browser demo contains synthetic data and has no API key. Source records are untrusted, are sent without tool access, and must pass output validation before acceptance. This reduces some failure modes but does not eliminate prompt injection or semantic errors.

Local run artifacts include source text and raw model output. Treat them according to the sensitivity of the supplied dataset. The local hash manifest detects inconsistency, not authenticity against an attacker who controls all files. Source flags are processing permissions supplied by the operator.

Dependency advisories are checked in CI. No public runtime accepts uploads, runs arbitrary source URLs, or exposes the model API on behalf of visitors.
