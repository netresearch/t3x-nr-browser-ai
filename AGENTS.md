<!-- FOR AI AGENTS - Human readability is a side effect, not a goal -->
<!-- Managed by agent: keep sections and order; edit content, not structure -->
<!-- Last updated: 2026-08-19 | Last verified: 2026-08-19 -->

# AGENTS.md

**Precedence:** The closest AGENTS.md to changed files wins. Root holds global defaults only.

## Project

`netresearch/nr-browser-ai` is a TYPO3 12.4/13.4/14.3 extension with two
frontend plugins that use the Chrome Prompt API locally. The assistant answers
from the current page; the form assistant fills a form and runs it.
Version lives in `ext_emconf.php`. Component map: `docs/ARCHITECTURE.md`;
decisions: `docs/decisions/`.

## Non-negotiable boundaries

- Keep the browser model behind `LanguageModelAdapter` and page extraction
  behind `PageContextProvider`.
- Never call `LanguageModel.create()` without a user activation.
- Do not add server LLM endpoints, persistence, cookies or telemetry for
  questions, context or answers.
- Treat selected page content and editor instructions as untrusted model data.
- Render model output with safe DOM APIs; allow only validated HTTP(S) links.
- Preserve fallback modes `none` and `contentElement`.
- Keep administrator system prompt and editor supplement as separate layers.
- Generate the form assistant's schema from the form definition; never write one
  by hand, and keep what a form does behind `FormAction`.
- Check tool arguments against the schema before applying them, whoever called:
  a response constraint and a published schema are promises, not guarantees.
- Resolve form controls by the element identifier their name ends with, not by a
  name derived on the server.
- Do not commit the root `composer.lock`; do commit `package-lock.json` and
  generated public frontend assets.

## Commands

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
bash Build/Scripts/verify-harness.sh
```

Use PHP 8.2-compatible syntax, TYPO3 APIs valid across all supported majors,
strict TypeScript, signed commits, DCO sign-off and Conventional Commits.

## Index of scoped AGENTS.md

- [Classes/AGENTS.md](./Classes/AGENTS.md) -- PHP source: controllers, form domain model, fallback renderer
- [Tests/AGENTS.md](./Tests/AGENTS.md) -- Unit, functional, JavaScript, E2E and repository-contract tests
- [Documentation/AGENTS.md](./Documentation/AGENTS.md) -- RST manual rendered for docs.typo3.org
- [Resources/AGENTS.md](./Resources/AGENTS.md) -- TypeScript sources, Fluid templates, XLIFF, committed public assets
- [.ddev/AGENTS.md](./.ddev/AGENTS.md) -- DDEV environment with parallel TYPO3 v12/v13/v14 installs
- [.github/workflows/AGENTS.md](./.github/workflows/AGENTS.md) -- CI/CD workflows calling shared Netresearch reusables
