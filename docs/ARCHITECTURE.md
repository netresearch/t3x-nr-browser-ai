# Architecture

Component map for agents. Facts only; the "why" lives in `decisions/`.

## System overview

Two Extbase frontend plugins render server-side configuration as data
attributes on a plugin root element; a self-contained TypeScript bundle
(`Resources/Public/JavaScript/Assistant.js`, built from
`Resources/Private/TypeScript/Assistant.ts`) reads those attributes and runs
Chrome's on-device Prompt API in the visitor's browser. No question, page
content or answer is sent to an application service.

## Components

| Component | Location | Role |
|-----------|----------|------|
| AssistantController | `Classes/Controller/AssistantController.php` | Page assistant: validates settings, emits prompt/context config as data attributes |
| FormAssistantController | `Classes/Controller/FormAssistantController.php` | Form assistant: renders form plus schema/tool metadata |
| Form domain | `Classes/Domain/Form/` | `FormDefinitionLoader` reads the shipped definition; `FormSchemaFactory` derives the JSON schema (`FormSchema` value object); `FormAssistantFormFactory` renders the same definition via EXT:form |
| FallbackContentRenderer | `Classes/Service/FallbackContentRenderer.php` | Renders the configured fallback content element |
| Model adapter | `Resources/Private/TypeScript/ai/` | `BrowserLanguageModelAdapter` + `LanguageModelSession` wrap `LanguageModel` |
| Page context | `Resources/Private/TypeScript/context/` | `PageContextProvider` interface, `DomPageContextProvider` implementation |
| Form/tool layer | `Resources/Private/TypeScript/form/`, `tools/`, `query/` | Schema source, `ArgumentValidator`, `FormFiller`; `LocalToolLoop`, `FormTool`, `ModelContextBinding`; `FormAction`, `OpenMeteoQuery` |
| Rendering | `Resources/Private/TypeScript/rendering/SafeResponseRenderer.ts`, `result/` | Safe DOM output, validated HTTP(S) links |
| UI | `Resources/Private/TypeScript/ui/` | `ChatController`, `FormAssistantController`, `NotFoundGate` |
| TYPO3 integration | `Configuration/` | Services.yaml (DI), TCA overrides, TypoScript static include importing the site set `Configuration/Sets/NrBrowserAi/` |

## Data flow

1. Editor places a plugin; administrator/editor settings are validated in the
   controller and serialized as data attributes.
2. `Assistant.ts` boots from those attributes; page text is extracted through
   `PageContextProvider`.
3. The model is created behind `LanguageModelAdapter` after a user activation;
   for the form assistant its output is constrained by the schema generated in
   PHP from the form definition.
4. Tool calls are validated by `ArgumentValidator` before `FormFiller` applies
   them; `FormAction` executes the form.
5. All model output is rendered by `SafeResponseRenderer`.
6. Unsupported browsers get fallback mode `none` or `contentElement`
   (`FallbackContentRenderer`).

## Key decisions

See `docs/decisions/`:

- `0001-vitest-3-dev-audit-exception.md`
- `0002-on-device-assistant-boundaries.md`
- `0003-form-assistant-schema-and-seam.md`
- `0004-demo-page-claims-trace-to-the-repository.md`
