# AGENTS.md

## Project

`netresearch/nr-browser-ai` is a TYPO3 12.4/13.4/14.3 extension with two
frontend plugins that use the Chrome Prompt API locally. The assistant answers
from the current page; the form assistant fills a form and runs it.

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
```

Use PHP 8.2-compatible syntax, TYPO3 APIs valid across all supported majors,
strict TypeScript, signed commits, DCO sign-off and Conventional Commits.
