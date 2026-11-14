<!-- SPDX-License-Identifier: GPL-2.0-or-later -->
<!-- SPDX-FileCopyrightText: Netresearch DTT GmbH -->
<!-- Managed by agent: keep sections and order; edit content, not structure. Last updated: 2026-08-19 -->

# AGENTS.md -- Classes

## Overview

PHP source of the extension, PSR-4 autoloaded as `Netresearch\NrBrowserAi\`
from `Classes/`. Ten classes: two Extbase controllers, a form domain
layer, a backend selector helper and one rendering service. Every file declares `strict_types=1`.

| File | Purpose |
|------|---------|
| `Controller/AssistantController.php` | Page-assistant plugin: validates FlexForm settings, puts prompt config on the plugin root as data attributes |
| `Controller/FormAssistantController.php` | Form-assistant plugin: renders the form plus schema/tool metadata as data attributes |
| `Domain/Form/FormDefinitionLoader.php` | Reads the bundled form definition from file |
| `Domain/Form/StorageFormLoader.php` | Loads a form created in the form editor through EXT:form's persistence manager, per-major arguments, identifier shape check |
| `Domain/Form/FormCatalog.php` | Lists the stored forms for the plugin's form selector, per-major |
| `Domain/Form/PersistenceManagerCall.php` | Reflection call into the persistence manager whose signatures differ across 12.4, 13.4 and 14.3 |
| `Backend/FormItemsProcessor.php` | `itemsProcFunc` of the plugin's form selector |
| `Domain/Form/FormSchemaFactory.php` | Turns the EXT:form definition into the JSON Schema constraining the model's structured output |
| `Domain/Form/FormSchema.php` | Value object: the schema plus the input elements it could not describe (unmapped types stay visible) |
| `Service/FallbackContentRenderer.php` | Renders the configured fallback content element via `ContentObjectRenderer`, with recursion guard |

## Setup

`composer install` resolves dev tooling into `.Build/` (bin-dir `.Build/bin`,
vendor-dir `.Build/vendor`). DI is configured in `Configuration/Services.yaml`
(autowire + autoconfigure; `FormItemsProcessor` is `public: true` because FormEngine
instantiates `itemsProcFunc` classes through `GeneralUtility::makeInstance`).

## Commands

```bash
composer ci:test:php:cgl        # PHP-CS-Fixer dry-run
composer ci:test:php:phpstan    # PHPStan (Build/phpstan.neon, shared level-10 config)
composer ci:test:php:rector     # Rector dry-run
composer ci:test:php:unit       # PHPUnit unit suite
typo3DatabaseDriver=pdo_sqlite composer ci:test:php:functional
```

## Code style

- PHP 8.2-compatible syntax only; TYPO3 APIs must be valid on 12.4, 13.4 and 14.3.
- `declare(strict_types=1)`, `final` classes, constructor injection via Services.yaml.
- PHP-CS-Fixer config: `Build/.php-cs-fixer.dist.php`; Rector: `Build/rector.php`.
- Clamp and validate FlexForm/settings values before use (see the constants and
  guards in `AssistantController`).

## Security

- Treat every editor-supplied value (FlexForm settings, editor instructions,
  selected page content) as untrusted model data; validate server-side before it
  reaches a data attribute.
- Never generate the form schema by hand -- `FormSchemaFactory` derives it from
  the form definition so schema and form cannot drift.
- No server-side LLM calls, persistence or telemetry -- the model runs in the
  visitor's browser only.

## PR checklist

- [ ] cgl, phpstan, rector and unit suites pass
- [ ] Functional tests pass with `typo3DatabaseDriver=pdo_sqlite`
- [ ] New settings validated/clamped before output
- [ ] `Tests/Repository/metadata.sh` still passes if composer.json changed

## Examples

Follow `Domain/Form/FormSchemaFactory.php` for the pattern "derive, do not
duplicate": one source array feeds both the rendered form and the schema.
Follow `AssistantController` for settings validation (constants for defaults
and limits, explicit type narrowing instead of casts).

## When stuck

Read the class docblocks first -- they explain why the persistence-manager and
allow-list routes were avoided. Cross-major behaviour questions: check both the
12.4 and 14.3 API before using a symbol. Decisions live in `../docs/decisions/`.
