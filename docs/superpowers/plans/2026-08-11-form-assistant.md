# Form assistant implementation plan

**Goal:** A second frontend plugin that turns one sentence into a filled Open-Meteo query form and a real result, through `intent → structured output → tool → action`, with the tool exposed both to the extension's own on-device session and to WebMCP.

**Design:** `docs/superpowers/specs/2026-08-11-form-assistant-design.md`

**Tech stack:** PHP 8.2–8.5, TYPO3 Extbase/Fluid/Form 12.4–14.3, TypeScript, esbuild, Vitest with jsdom, Playwright with axe-core, PHPUnit, PHPStan level 10, PHP-CS-Fixer.

---

## File map

```text
Classes/
  Controller/FormAssistantController.php
  Domain/Form/FormDefinitionLoader.php
  Domain/Form/FormSchemaFactory.php
  Domain/Form/FormSchema.php
  Domain/Form/FormAssistantFormFactory.php
Configuration/
  FlexForms/FormAssistant.xml
  Sets/NrBrowserAi/setup.typoscript          (extend)
  Sets/NrBrowserAi/settings.definitions.yaml (extend)
  TypoScript/constants.typoscript            (extend)
  TCA/Overrides/tt_content.php               (extend)
Resources/
  Private/Forms/weatherQuery.form.yaml
  Private/Templates/FormAssistant/Show.html
  Private/TypeScript/Assistant.ts            (extend: bootstrap both roots)
  Private/TypeScript/types.ts                (extend: prompt with responseConstraint)
  Private/TypeScript/form/FormSchemaSource.ts
  Private/TypeScript/form/ArgumentValidator.ts
  Private/TypeScript/form/FormFiller.ts
  Private/TypeScript/form/FormSchema.ts
  Private/TypeScript/query/FormAction.ts
  Private/TypeScript/query/OpenMeteoQuery.ts
  Private/TypeScript/tools/FormTool.ts
  Private/TypeScript/tools/ModelContextBinding.ts
  Private/TypeScript/tools/LocalToolLoop.ts
  Private/TypeScript/result/ResultRenderer.ts
  Private/TypeScript/ui/FormAssistantController.ts
  Private/Language/*.xlf                     (extend)
Tests/
  Unit/Domain/Form/FormSchemaFactoryTest.php
  Functional/Controller/FormAssistantControllerTest.php
  JavaScript/form/*.test.ts
  JavaScript/query/OpenMeteoQuery.test.ts
  JavaScript/tools/*.test.ts
  JavaScript/result/ResultRenderer.test.ts
  E2E/form-assistant.spec.ts
Documentation/
  User/FormAssistant.rst
  Administration/Configuration.rst           (extend)
```

---

## Task 1 — Dependency and skeleton

- [ ] Add `typo3/cms-form: ^12.4 || ^13.4 || ^14.3` to `require`; refresh `.Build` install.
- [ ] Register plugin `FormAssistant` in `ext_localconf.php` and `Configuration/TCA/Overrides/tt_content.php`, following the existing v14 `columnsOverrides` branch.
- [ ] `Configuration/FlexForms/FormAssistant.xml`: form selection, action identifier, title, introduction, supplemental instruction, disclosure toggle.
- [ ] TypoScript in the site set plus matching constants and settings definitions.
- [ ] Language keys in all four XLF files.

**Verify:** `composer ci:test:php:cgl`, `composer ci:test:php:phpstan`, plugin appears in the new-content wizard in a functional test.

## Task 2 — Schema generation

- [ ] `FormDefinitionLoader`: read the shipped YAML file directly. EXT:form's persistence manager needs extension paths allow-listed first, and the registration for that was deprecated in TYPO3 14.2 in favour of a directory convention 12.4 and 13.4 do not know.
- [ ] `FormSchemaFactory`: element and validator mapping per the design's tables; unknown element types are skipped and reported, never guessed.
- [ ] No server-side field-name derivation. EXT:form builds names from the form identifier and the surrounding plugin namespace, both of which have moved between versions; the client resolves a control by the element identifier its name ends with instead.

**Verify:** unit tests per element type and validator; a functional test asserts every schema property can be found that way among the controls EXT:form actually rendered.

## Task 3 — Demonstration form

- [ ] `Resources/Private/Forms/weatherQuery.form.yaml` covering place, date range, hourly variables, daily variables, model, four unit groups, timezone.
- [ ] Every element carries an `elementDescription` — that text is what the model reads.
- [ ] Render it through `formvh:render` with a `factoryClass`, so no persistence identifier and no allow-listing are involved.

**Verify:** unit test asserts the generated property list and enum sizes against the shipped file; functional test asserts the form renders.

## Task 4 — Client tool layer

- [ ] Extend `ModelSession`/`BrowserLanguageModelAdapter` with `prompt(input, {responseConstraint})`.
- [ ] `FormSchemaSource`, `ArgumentValidator`, `FormFiller`.
- [ ] `FormAction` interface; `OpenMeteoQuery` as its only implementation, geocoding included.
- [ ] `FormTool`, `ModelContextBinding` with `document`/`navigator` fallback and `AbortSignal` teardown, `LocalToolLoop`.
- [ ] `ResultRenderer` with safe DOM construction only.
- [ ] `ui/FormAssistantController` wiring status, input row and disclosure, reusing the existing status vocabulary.

**Verify:** Vitest per module; `npm run typecheck`; bundle builds.

## Task 5 — End to end

- [ ] Playwright spec driving the whole chain with a stubbed model and a stubbed data source.
- [ ] axe-core check on the rendered plugin.

**Verify:** `npm run test:e2e`.

## Task 6 — Documentation and metadata

- [ ] `Documentation/User/FormAssistant.rst`, linked from the user index.
- [ ] `Documentation/Administration/Configuration.rst` extended with the new settings.
- [ ] README section describing both plugins, kept in step with the manual.
- [ ] No CHANGELOG entry and no version bump: both belong to the separate release flow.

**Verify:** `bash Tests/Repository/metadata.sh`, `bash Tests/Repository/documentation.sh`.

## Task 7 — Green and merged

- [ ] Full local chain: cgl, phpstan, rector, unit, functional, `npm run ci`, coverage, e2e, both repository scripts.
- [ ] Push, open the pull request, drive it to green, resolve every review thread.

## Task 8 — Release and demonstration page

- [ ] Prepare 0.5.0 by the org's release procedure; the tag stays with a human.
- [ ] After release, raise the constraint in `netresearch/typo3-demo` and merge.
- [ ] Build the demonstration page: what it does, how the chain works, what it is good for, where else the technique applies.
