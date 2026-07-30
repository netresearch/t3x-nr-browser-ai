# ADR-0001: Close the Vitest 3 development audit exception

## Status

Superseded

## Date

2026-07-28

## Context

The initial toolchain used Vitest 3. An `npm audit` reported five
high-severity findings in development-only coverage tooling through
`test-exclude`, `glob`, `minimatch`, and `brace-expansion`. npm required a
coordinated major upgrade to Vitest 4 and `@vitest/coverage-v8` 4.

The TYPO3 extension declares no Node.js runtime dependencies, and these packages are not shipped as extension runtime code.

## Decision

Upgrade Vitest and `@vitest/coverage-v8` together to 4.1.10. The upgraded
dependency tree reports zero vulnerabilities, so no audit exception or
transitive override remains.

## Exit criterion

Met on 2026-07-30 by the coordinated upgrade and a clean `npm audit`.
