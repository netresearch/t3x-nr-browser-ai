<!-- SPDX-License-Identifier: GPL-2.0-or-later -->
<!-- SPDX-FileCopyrightText: Netresearch DTT GmbH -->

# Security assurance case

This document states what the extension does and does not guarantee in terms
of security, which data goes where, the threat model it is built against, and
how the code counters the weaknesses that apply to it. Every claim names the
file that implements it. Components are listed in
[ARCHITECTURE.md](ARCHITECTURE.md), the binding design decision is
[ADR-0002](decisions/0002-on-device-assistant-boundaries.md), the operator view
is the manual page [Privacy and trust boundaries](../Documentation/Security/Privacy.rst),
and how to report a vulnerability is in [SECURITY.md](../SECURITY.md).

## What the extension is for

Two frontend plugins. The page assistant answers a visitor's question from the
text of the page the visitor is reading. The form assistant turns a sentence
into the values of a shipped EXT:form form, runs the form against its data
source and summarises the result. Both use Chrome's on-device Prompt API
(`LanguageModel`) in the visitor's browser. The extension has no backend
module, no server-side AI call and no endpoint of its own:
`Configuration/TCA/Overrides/tt_content.php` and `ext_localconf.php` register
the two plugins and nothing else, and no class under `Classes/` opens an HTTP
connection.

## Data flows

| # | From | To | What | Where in the code |
|---|------|----|------|-------------------|
| 1 | TYPO3 (server) | Visitor's browser | Plugin settings (context selector, usage limit, administrator system prompt, editor instruction, form schema, tool name and description, action name) as data attributes on the plugin root; the chosen fallback content element as normal rendered content | `Classes/Controller/AssistantController.php`, `Classes/Controller/FormAssistantController.php`, `Resources/Private/Templates/*/Show.html`, `Classes/Service/FallbackContentRenderer.php` |
| 2 | Page DOM | On-device model | Text of the configured page area, the page title and `<html lang>`, the visitor's question, the system prompt and the editor instruction | `Resources/Private/TypeScript/context/DomPageContextProvider.ts`, `Resources/Private/TypeScript/ai/LanguageModelSession.ts` |
| 3 | Visitor's browser | Open-Meteo (`geocoding-api.open-meteo.com`, `api.open-meteo.com`) | Form assistant only: the place name and page language for geocoding, then latitude, longitude and the selected form values for the forecast. The visitor's IP address is visible to the service | `Resources/Private/TypeScript/query/OpenMeteoQuery.ts` |
| 4 | An agent in the browser | Form tool | Tool arguments, where the browser offers a model context (`document.modelContext` or `navigator.modelContext`) | `Resources/Private/TypeScript/tools/ModelContextBinding.ts`, `Resources/Private/TypeScript/tools/FormTool.ts` |
| 5 | Chrome | Google | Model download and updates, managed by the browser, not by the extension | none |

No question, page text or answer is sent to TYPO3 or to any other service. The
only request the extension's code sends is flow 3; its two URLs are constants
in `OpenMeteoQuery.ts`, and the form's `action` setting selects it only when it
is `openMeteo` (`FormAssistantController::SUPPORTED_ACTIONS` on the server,
`defaultActionFactory` in `Resources/Private/TypeScript/ui/FormAssistantController.ts`
in the browser). Nothing is written to cookies, Web Storage or IndexedDB; the
dialogue lives in memory and the sessions are destroyed on reset and on
`pagehide` (`Resources/Private/TypeScript/Assistant.ts`,
`Resources/Private/TypeScript/ui/ChatController.ts`).

## What users can expect

- **Model output cannot inject markup.** Every answer is rendered by
  `Resources/Private/TypeScript/rendering/SafeResponseRenderer.ts`, which
  builds a restricted Markdown subset from `createElement` and text nodes and
  never parses HTML; no file under `Resources/Private/TypeScript/` uses
  `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `DOMParser` or `eval`. Form
  results, place names and the last tool call are written with `textContent`
  (`Resources/Private/TypeScript/result/ResultRenderer.ts`,
  `Resources/Private/TypeScript/ui/FormAssistantController.ts`).
- **Links from model output are HTTP(S) only.** `parseWebUrl()` in
  `SafeResponseRenderer.ts` accepts a URL only when `new URL()` parses it with
  protocol `http:` or `https:`; anything else stays text. Links to another
  origin open in a new tab with `rel="noopener noreferrer"`. Model output never
  navigates, submits a form or triggers another action by itself.
- **Tool arguments are checked before they touch the page.** `FormTool::execute()`
  calls `validateArguments()` (`Resources/Private/TypeScript/form/ArgumentValidator.ts`)
  before `FormFiller` writes anything: unknown fields, values outside an enum
  and non-numeric numbers are rejected, numbers are clamped to the schema's
  bounds. This applies to the page's own model and to an external agent alike.
  One request runs at most four queries (`DEFAULT_MAXIMUM_QUERIES` in
  `Resources/Private/TypeScript/tools/LocalToolLoop.ts`).
- **Server-side settings are validated and escaped.** `AssistantController`
  falls back to defaults for an empty or over-long context selector and for a
  usage limit outside (0, 1], accepts only `none` and `contentElement` as
  fallback modes, and accepts a content reference only as a positive integer.
  The templates output every setting through Fluid escaping
  (`f:format.htmlspecialchars` in the data attributes).
- **Only shipped form definitions are loaded.** `FormDefinitionLoader::load()`
  accepts identifiers matching `^[a-zA-Z][a-zA-Z0-9]{0,63}$` and reads only
  `EXT:nr_browser_ai/Resources/Private/Forms/<identifier>.form.yaml`, so an
  identifier cannot name another path.
- **Fallback content respects TYPO3 access rules.** `FallbackContentRenderer`
  renders the selected record through the `RECORDS` content object, which
  applies the enable fields, and refuses self-references and cycles.

## What users cannot expect

- **Prompt injection is reduced, not prevented.** The page text is wrapped in a
  `<source-document>` element with its markup characters escaped
  (`serializeSourceDocument()` in `LanguageModelSession.ts`), and the default
  system prompt tells the model not to follow instructions found in it. A model
  can still be steered by page content or by the question. The consequences are
  bounded by the output and argument checks above, not by the prompt.
- **Answers can be wrong.** They must not be used for authorisation, legal,
  medical or financial decisions without independent controls.
- **Prompts are public.** The administrator system prompt and the editor
  instruction are data attributes in the page source, and the form assistant
  can display them. They must not contain secrets.
- **Form queries leave the browser.** Flow 3 reaches Open-Meteo directly; the
  site operator names it in the site's privacy information.
- **The extension does not govern Chrome.** Model download, storage and the
  Prompt API's own behaviour are the browser's.
- **The extension trusts its configuration.** TypoScript, site settings and
  FlexForm values are written by administrators and editors under TYPO3's
  backend permissions.

## Threat model

| Actor | Trust | Can influence |
|-------|-------|---------------|
| Visitor | Untrusted | The question, the form values, the browser environment |
| Page content author (including third-party plugins rendered on the page) | Untrusted as model input | The text the model reads |
| On-device model | Untrusted output | Answer text, tool arguments |
| Agent using the browser's model context | Untrusted | Tool arguments |
| Open-Meteo | Untrusted response | Result data shown to the visitor |
| Editor | Trusted within TYPO3 permissions | Plugin settings, editor instruction, fallback reference |
| Administrator / integrator | Trusted | System prompt, site settings, TypoScript |

Trust boundaries:

1. **TYPO3 to browser.** Controllers validate settings; templates escape them
   into data attributes.
2. **Page and question to model.** `DomPageContextProvider` reads a clone of the
   selected element and removes `script`, `style`, `noscript`, `nav`, `form`,
   hidden and `aria-hidden` content, the assistant itself and anything marked
   `data-nr-browser-ai-exclude`; `LanguageModelSession` delimits it as source
   data.
3. **Model or agent to page.** `SafeResponseRenderer` for text,
   `ArgumentValidator` for tool arguments.
4. **Browser to data source.** `OpenMeteoQuery` builds both URLs from constants
   and sets parameters through `URLSearchParams`, which encodes them.
5. **Data source to page.** Results are rendered as text nodes and table cells
   by `ResultRenderer`.

## Weaknesses and how the code counters them

LLM entries refer to the OWASP Top 10 for LLM Applications 2025.

| Weakness | Where it could arise | Countermeasure |
|----------|---------------------|----------------|
| Cross-site scripting (CWE-79, OWASP Top 10 injection) | Model answers, form results, settings in the page | DOM construction with text nodes only (`SafeResponseRenderer.ts`, `ResultRenderer.ts`); Fluid escaping of settings in `Resources/Private/Templates/*/Show.html`. Covered by `Tests/JavaScript/rendering/SafeResponseRenderer.test.ts` and `Tests/JavaScript/result/ResultRenderer.test.ts` |
| Improper output handling (OWASP LLM05) | Links and formatting in model output | HTTP(S)-only links through `parseWebUrl()`; `noopener noreferrer` on cross-origin links; no action is triggered by output |
| Prompt injection (OWASP LLM01) | Page text, question, editor instruction | Source data delimited and escaped in `LanguageModelSession.ts`; administrator prompt and editor instruction kept as separate layers (`combineInstructions()`); consequences limited by the two rows above and below |
| Excessive agency (OWASP LLM06) | Tool calls from the model or an external agent | One tool, one fixed action; arguments validated against the schema generated from the form definition (`Classes/Domain/Form/FormSchemaFactory.php`, `ArgumentValidator.ts`); at most four queries per request; the tool is registered with `untrustedContentHint: true`. Covered by `Tests/JavaScript/form/ArgumentValidator.test.ts` and `Tests/JavaScript/tools/` |
| Sensitive information disclosure (OWASP LLM02) | Dialogue data | No endpoint, storage or telemetry for questions, context or answers; sessions destroyed on reset and page exit (ADR-0002) |
| Path traversal (CWE-22) | Form identifier | Identifier pattern and fixed directory in `FormDefinitionLoader.php` |
| Request to an unintended destination | Form action | Allow-list of actions on server and client; fixed URLs in `OpenMeteoQuery.ts`. Covered by `Tests/JavaScript/query/OpenMeteoQuery.test.ts` |
| Uncontrolled recursion (CWE-674) | Fallback content referencing itself | Render stack in `FallbackContentRenderer.php`. Covered by `Tests/Unit/Service/FallbackContentRendererTest.php` |
| Regular-expression denial of service (CWE-1333) | Parsing streamed model output on every chunk | Block syntax recognised with string operations, not patterns (`SafeResponseRenderer.ts`) |
| Model download without consent | Opening a page | `LanguageModel.create()` is reached only from the event handler of a click or a form submission (`ChatController.ts`, `FormAssistantController.ts`); `demo/capability-check.js` only calls `availability()` |

## Secure design principles applied

- **Least privilege and data minimisation:** inference on the device; no
  server endpoint, storage or telemetry (ADR-0002).
- **Complete mediation:** every model answer passes `SafeResponseRenderer`,
  every tool call passes `ArgumentValidator`, whoever the caller is.
- **Fail-safe defaults:** invalid settings fall back to defaults; an unknown
  action leaves the plugin a plain form; an unsupported browser gets the
  operator's fallback or nothing (`AssistantController.php`,
  `FormAssistantController.ts`).
- **Economy of mechanism:** one Markdown subset, one tool, one action, two
  fixed URLs.
- **Least privilege in automation:** every workflow in `.github/workflows/`
  sets `permissions: {}` or `contents: read` at the top and grants further
  scopes per job.

## Verification

The checks that run on every pull request and how to run the tests locally are
listed in [CONTRIBUTING.md](../CONTRIBUTING.md#governance-and-policies).
Vulnerabilities are reported and handled as described in
[SECURITY.md](../SECURITY.md).
