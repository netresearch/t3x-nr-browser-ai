# ADR-0001: Accept the Vitest 3 development audit exception

## Status

Accepted temporarily

## Date

2026-07-28

## Context

The approved toolchain uses Vitest 3. A current `npm audit` reports five high-severity findings in development-only coverage tooling through `test-exclude`, `glob`, `minimatch`, and `brace-expansion`. npm offers only a coordinated major upgrade to Vitest 4 and `@vitest/coverage-v8` 4 as an automatic fix.

The TYPO3 extension declares no Node.js runtime dependencies, and these packages are not shipped as extension runtime code.

## Decision

Keep the approved Vitest 3 constraints during proof-of-concept development and report the audit exception in verification results.

## Exit criterion

Before the first release, revisit a coordinated Vitest 4 and coverage-provider upgrade. The exception can be closed only when the development dependency audit no longer reports these findings or the affected tooling has been removed.
