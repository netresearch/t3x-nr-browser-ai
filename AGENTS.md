# AGENTS.md

## Project

`netresearch/nr-browser-ai` is a TYPO3 12.4/13.4/14.3 frontend plugin that
uses the Chrome Prompt API locally. The POC context scope is the current page.

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
