<!-- Managed by agent: keep sections and order; edit content, not structure. Last updated: 2026-08-19 -->

# AGENTS.md -- Resources

## Overview

Frontend sources and their committed build outputs.

- `Private/TypeScript/` -- strict TypeScript sources, entry `Assistant.ts`;
  subsystems: `ai/` (LanguageModel adapter + session), `context/`
  (PageContextProvider + DOM implementation), `form/` (schema source,
  argument validation, form filling, group roles), `tools/` (local tool loop,
  form tool, model-context binding), `query/` (FormAction, OpenMeteoQuery),
  `rendering/` (SafeResponseRenderer), `result/`, `ui/` (chat and
  form-assistant controllers, NotFoundGate).
- `Private/Styles/Assistant.css` -- source stylesheet, copied verbatim to Public.
- `Private/Templates/` -- Fluid templates `Assistant/Show.html`,
  `FormAssistant/Show.html`; they pass configuration to TypeScript via data
  attributes on the plugin root.
- `Private/Language/` -- XLIFF (`locallang*.xlf`, `Forms.xlf`, plus `de.` files).
- `Private/Forms/weatherQuery.form.yaml` -- the shipped form definition; source
  of the generated JSON schema.
- `Public/JavaScript/Assistant.js`, `Public/Css/Assistant.css`, `Public/Icons/`
  -- COMMITTED build artifacts; CI fails if they differ from a fresh build.

## Setup

```bash
npm ci                # toolchain (esbuild, tsc, vitest)
```

## Commands

```bash
npm run typecheck     # tsc --noEmit, strict
npm run build         # esbuild bundle -> Public/JavaScript/Assistant.js (ES module, chrome148)
npm run build:css     # copy stylesheet -> Public/Css/Assistant.css
npm run ci            # typecheck + build + build:css + vitest
```

After changing anything under `Private/TypeScript/` or `Private/Styles/`,
rebuild and commit the changed `Public/` outputs; CI verifies with
`git diff --exit-code -- Resources/Public`.

## Code style

- Strict TypeScript, ES modules, no runtime dependencies -- the bundle must
  stay self-contained.
- German translations live in `de.`-prefixed XLIFF siblings; keep units in sync
  with the source files.
- Data-attribute names on the plugin root are a contract with the Fluid
  templates and the template-contract tests -- change all three together.

## Security

- All model output goes through `rendering/SafeResponseRenderer.ts`: safe DOM
  APIs only, links validated to HTTP(S).
- `form/ArgumentValidator.ts` checks tool arguments against the schema before
  `form/FormFiller.ts` applies them -- never bypass it.
- `ai/` wraps `LanguageModel` behind an adapter; creation requires a user
  activation. No fetch of page data to any server; `query/OpenMeteoQuery.ts`
  is the form demo's action target, not a telemetry channel.

## PR checklist

- [ ] `npm run ci` passes and rebuilt `Public/` assets are committed
- [ ] Vitest suites mirror new TypeScript files
- [ ] Template/data-attribute changes update both templates and contract tests
- [ ] XLIFF source and `de.` files stay in sync

## Examples

`context/DomPageContextProvider.ts` implementing `context/PageContextProvider.ts`
is the seam pattern for everything browser-specific: an interface the tests can
substitute, one DOM implementation. `tools/FormTool.ts` + `query/FormAction.ts`
show how a tool call becomes a real action behind a seam.

## When stuck

A red "Verify committed assets" CI step means you forgot to rebuild or to
commit `Public/`. Type errors referencing `LanguageModel`: types come from
`@types/dom-chromium-ai`. Behaviour questions: the mirrored test in
`Tests/JavaScript/` is the executable spec.
