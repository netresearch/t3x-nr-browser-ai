<!-- Managed by agent: keep sections and order; edit content, not structure. Last updated: 2026-08-19 -->

# AGENTS.md -- .github/workflows

## Overview

Thin callers of shared Netresearch reusables plus two repo-local jobs.

| Workflow | Purpose |
|----------|---------|
| `ci.yml` | Test matrix via `netresearch/typo3-ci-workflows/ci.yml`: PHP 8.2-8.5 x TYPO3 ^13.4/^14.3 (full), PHP 8.2-8.4 x ^12.4 (compat, reduced checks); `browser` job (typecheck, vitest+coverage, rebuild, `git diff --exit-code -- Resources/Public`); `repository` job running the contract scripts |
| `checks.yml` | Security/quality reusables (security, gitleaks, zizmor, fuzz, license-check, CodeQL, scorecard, dependency-review, pr-quality) feeding the single required `All security checks` gate |
| `harness-verify.yml` | Agent-harness consistency via `Build/Scripts/verify-harness.sh` (exit 2 = warnings only, passes) |
| `release.yml` / `ter-publish.yml` | Release and manual TER publishing reusables |
| `pages.yml` | Builds and publishes the demo page from source |
| `auto-merge-deps.yml`, `check-template-drift.yml`, `community.yml`, `labeler.yml` | Org housekeeping reusables |

## Workflow files

All third-party actions are SHA-pinned with a version comment; jobs default to
`permissions: {}` or `contents: read` and grant exactly the called reusable's
contract. `checks.yml` is drift-enforced against the org template
(intentional drift lives only in `ci.yml`'s matrix).

## Commands

```bash
gh workflow list -R netresearch/t3x-nr-browser-ai
gh pr checks <nr> -R netresearch/t3x-nr-browser-ai
bash Build/Scripts/verify-harness.sh   # what harness-verify.yml runs
```

## Workflow conventions

- Any job added to `checks.yml` MUST also be added to `gate.needs` -- the gate
  is the only required context, and a job missing there fails silently (see the
  comment block in `checks.yml`).
- Keep `ci.yml`'s v12 call reduced (no cgl/phpstan/rector, `remove-dev-deps`
  strips the PHPStan-heavy meta-package): 12.4 is an EOL compatibility target.
- Do not require pull-request-only or code-scanning check names in rulesets;
  require `All security checks` (merge-queue rationale in `checks.yml`).

## Security

Repo-local jobs start with harden-runner (exception: the single-step Pages
deploy job). Checkouts use `persist-credentials: false`. Never loosen a
`permissions:` block to fix a failure -- find the missing scope the reusable
actually declares.

## PR checklist

- [ ] New/changed `uses:` targets are Netresearch reusables or SHA-pinned actions
- [ ] New job in `checks.yml` also appended to `gate.needs`
- [ ] `zizmor` (part of checks.yml) passes on workflow changes
- [ ] AGENTS.md files updated when commands or matrix change (harness drift check)

## Examples

`ci.yml`'s `repository` job is the pattern for repo-local jobs: harden-runner,
pinned checkout without credentials, no unneeded toolchain setup.

## When stuck

The truth about what a matrix runs lives in the called reusable in
`netresearch/typo3-ci-workflows`; read it before changing caller inputs.
Required-context questions: the ruleset requires `All security checks`, not
individual jobs.
