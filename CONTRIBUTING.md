<!-- SPDX-License-Identifier: GPL-2.0-or-later -->
<!-- SPDX-FileCopyrightText: Netresearch DTT GmbH -->
# Contributing

Thank you for improving Netresearch Browser AI. Please discuss large scope or
architecture changes in a GitHub issue before implementation.

## Development setup

```bash
git clone https://github.com/netresearch/t3x-nr-browser-ai.git
cd t3x-nr-browser-ai
ddev start
ddev install-all
npm ci
```

Do not commit a root `composer.lock`: this repository is a TYPO3 extension
library and its CI resolves the supported dependency matrix. The frontend
`package-lock.json` is committed to make the asset build reproducible.

## Required checks

```bash
composer ci:test:php:cgl
composer ci:test:php:phpstan
composer ci:test:php:unit
typo3DatabaseDriver=pdo_sqlite composer ci:test:php:functional
bash Tests/Repository/metadata.sh
bash Tests/Repository/documentation.sh
npm run ci
npm run test:js:coverage
npm run test:e2e
git diff --exit-code Resources/Public
```

Keep source TypeScript and CSS in `Resources/Private/`; commit the matching
compiled files in `Resources/Public/`. Never add an application LLM endpoint,
chat persistence or telemetry without an explicit architecture and privacy
review.

Use Conventional Commits, sign the commit and include the DCO sign-off:

```text
feat: describe the user-visible change

Signed-off-by: Your Name <you@example.com>
```

Open a pull request against `main`, explain manual Chrome verification and
wait for all required checks and review conversations to complete.

## Commit Signing

All commits must be cryptographically signed and carry a DCO sign-off: `git commit -S --signoff`. The `require-signed-commits` ruleset on the default branch enforces the signature (the "Verified" badge on GitHub); the DCO check enforces the `Signed-off-by` trailer — these are two different things and both are required. Quickest setup is SSH signing: register your SSH key as a *signing key* on your GitHub account, then `git config --global gpg.format ssh && git config --global user.signingkey ~/.ssh/<key>.pub`.

## Governance and policies

This extension follows the organisation-wide Netresearch policies:

- [Governance](https://github.com/netresearch/.github/blob/main/GOVERNANCE.md): ownership, roles, how decisions are made and conflicts resolved.
- [Roadmap](https://github.com/netresearch/.github/blob/main/ROADMAP.md): planned and excluded work for the next twelve months.
- [Handling of dependency and code analysis findings](https://github.com/netresearch/.github/blob/main/SECURITY.md#handling-of-dependency-and-code-analysis-findings): which vulnerability, licence and static-analysis findings must be fixed, by when, and how exceptions are recorded.
- [Secret management](https://github.com/netresearch/.github/blob/main/SECURITY.md#secret-management): where project, CI and release credentials are stored, who may use them, and how they are rotated or revoked.
- [Access roster](https://github.com/netresearch/.github/blob/main/docs/access-roster.md): the people and teams with administrative or write access to this repository.

What the extension guarantees in terms of security, and what it does not, is
described in [docs/SECURITY-ASSURANCE.md](docs/SECURITY-ASSURANCE.md).

These checks run on every pull request:

- `.github/workflows/checks.yml`: Composer Audit and Opengrep (through `security.yml` of netresearch/typo3-ci-workflows), Dependency Review, the PHP licence audit (`license-check.yml`), CodeQL for JavaScript/TypeScript and the workflows, Betterleaks secret scanning and zizmor. Its `fuzz` job finds no fuzz suite in `Build/*.xml` and is skipped.
- `.github/workflows/ci.yml`: PHP lint, code style, PHPStan, Rector, unit and functional tests and the documentation render on the supported PHP and TYPO3 versions; the browser job type-checks the TypeScript, runs the Vitest suites with coverage and fails when the committed files in `Resources/Public` differ from a fresh build; `Tests/Repository/metadata.sh` and `Tests/Repository/documentation.sh`.
- `.github/workflows/harness-verify.yml` and `.github/workflows/check-template-drift.yml`: agent harness consistency and drift from the shared typo3-extension template.

The Playwright end-to-end tests (`npm run test:e2e`) run locally only; no
workflow invokes them. `composer.json` configures no Composer Audit exception;
[ADR-0001](docs/decisions/0001-vitest-3-dev-audit-exception.md) records the
one npm audit exception this project had and how it was closed.
