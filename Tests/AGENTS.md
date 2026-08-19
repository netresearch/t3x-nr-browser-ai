<!-- Managed by agent: keep sections and order; edit content, not structure. Last updated: 2026-08-19 -->

# AGENTS.md -- Tests

## Overview

Five test layers plus repository contracts:

| Directory | Layer |
|-----------|-------|
| `Unit/` | PHPUnit unit tests (Configuration, Controller, Domain/Form, Service) |
| `Functional/` | TYPO3 functional tests with SQLite (site set, both controllers) |
| `JavaScript/` | Vitest suites mirroring `Resources/Private/TypeScript/` plus template-contract tests |
| `E2E/` | Playwright specs against the built demo page (`playwright.config.ts` starts the demo server) |
| `Repository/` | Bash contract scripts: `metadata.sh` (composer/package/emconf invariants), `documentation.sh` (README/RST assertions), ddev helpers |
| `Fixtures/` | Shared markup fixtures for JS tests |

Bootstraps: `Bootstrap.php` (unit), `FunctionalBootstrap.php` (functional).

## Setup

PHP suites need `composer install` first. JS suites need `npm ci`. E2E needs
Playwright browsers (`npx playwright install chromium`) or the containerized
route `Build/Scripts/runTests.sh -s e2e`.

## Commands

```bash
composer ci:test:php:unit
typo3DatabaseDriver=pdo_sqlite composer ci:test:php:functional
npm run test:js                  # Vitest once
npm run test:js:coverage         # Vitest with V8 coverage
npm run test:e2e                 # Playwright (builds + serves the demo itself)
bash Tests/Repository/metadata.sh
bash Tests/Repository/documentation.sh
```

## Code style

- Unit tests mirror the source path (`Tests/Unit/<path>/<Class>Test.php`).
- JS tests mirror the TypeScript directory layout one-to-one.
- Functional fixtures live under `Functional/Fixtures/`; the frontend fixture
  must NOT re-import the production content-element mapping (`metadata.sh`
  enforces this).
- Template-contract tests (`JavaScript/TemplateContract.test.ts`,
  `FormTemplateContract.test.ts`) pin the data-attribute contract between Fluid
  templates and TypeScript -- update both sides together.

## Security

Tests are the enforcement layer for the boundaries in the root AGENTS.md:
`JavaScript/form/ArgumentValidator.test.ts` pins schema validation of tool
arguments, `JavaScript/rendering/` pins safe DOM rendering. Never weaken or
delete a failing boundary test to get green.

## PR checklist

- [ ] New PHP code has unit tests; controller behaviour changes have functional coverage
- [ ] New TypeScript has a mirrored Vitest suite
- [ ] Template/data-attribute changes update the contract tests
- [ ] Repository contract scripts still pass after metadata changes

## Examples

`Tests/Unit/Domain/Form/FormSchemaFactoryTest.php` shows the expected style:
data-driven cases over the real form definition, asserting both the schema and
the unmapped-element list. E2E specs (`E2E/assistant.spec.ts`) run against the
served demo bundle, not against mocks.

## When stuck

E2E failures: run `npm run build:demo && node demo/serve.mjs` and open
`http://127.0.0.1:4173/` manually. Functional failures: confirm
`typo3DatabaseDriver=pdo_sqlite` is set. Contract-script failures print the
exact missing assertion text.
