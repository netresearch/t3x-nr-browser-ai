# Form assistant — design

Date: 2026-08-11
Status: approved

## Goal

A second frontend plugin that turns a sentence into a filled complex form and a
real result. The visitor states an intent in prose, the on-device model emits
structured output constrained by the form's own schema, a tool writes those
values into the form and runs the query, and the answer comes back grounded in
what a public data source actually returned.

The chain is `intent → structured output → tool → real action`. The existing
assistant answers *about* a page; this one *operates* it.

## Why a form is the right demonstration

A parameter-rich form is where an assistant earns its keep. Nobody struggles to
read a page; plenty of people give up on a query form with thirty controls
because they do not know which of them expresses what they want. The value is
measurable in a way a chat answer is not: either the form holds the parameters
the sentence asked for, or it does not.

The data source is Open-Meteo. It needs no key, permits cross-origin requests,
carries its own geocoding endpoint, and exposes a parameter surface — around
forty hourly variables, daily variables, a model choice, four unit groups, a
time range — that is genuinely tedious to operate by hand.

## Decisions

| Question | Decision | Reason |
| --- | --- | --- |
| Scope | Staged: one built-in form now, generic bridge later | The demo carries itself and the later step discards nothing |
| Data source | Open-Meteo | Keyless, CORS-enabled, own geocoding, large parameter surface |
| Schema source | The EXT:form definition | Carries validators, options and descriptions — the semantics a model needs |
| Execution | Client-side `fetch` | Keeps the extension free of server endpoints and works on a static demo |
| Tool cut | One tool, whole chain | Shortest chain; the caller receives the result and can summarise it |
| Form size | Full parameter surface | The complexity is the point |

The full parameter surface is affordable because of the schema source: forty
hourly variables are *one* `MultiCheckbox` element, and therefore one schema
property of type `array` whose `items` carry forty `enum` values — not forty
boolean properties.

## Non-goals

- No server endpoint, no persistence, no telemetry. The existing boundaries in
  `AGENTS.md` hold unchanged.
- No submission of arbitrary forms. Phase 2 adds that behind the same seam.
- No cross-origin tool exposure (`exposedTo`, `fromOrigins`). The tool belongs
  to the page that renders the form.

## Architecture

### Server

`FormDefinitionLoader` reads a shipped form definition from its YAML file.
EXT:form's persistence manager is not used: an extension path has to be
allow-listed before it will load, and the registration for that was deprecated
in TYPO3 14.2 in favour of a directory convention 12.4 and 13.4 do not know.
Reading the file keeps one code path for all three.

`FormSchemaFactory` walks that array and produces JSON Schema. The mapping:

| EXT:form element | JSON Schema |
| --- | --- |
| `Text`, `Textarea` | `string` |
| `Number` | `number` |
| `Checkbox` | `boolean` |
| `Date` | `string`, `format: date` |
| `SingleSelect`, `RadioButton` | `string` with `enum` |
| `MultiCheckbox`, `MultiSelect` | `array`, `items.enum` |

| EXT:form validator | JSON Schema |
| --- | --- |
| `NotEmpty` | member of `required` |
| `NumberRange` | `minimum`, `maximum` |
| `StringLength` | `minLength`, `maxLength` |
| `RegularExpression` | `pattern` |

The element label becomes the property title, `properties.elementDescription`
becomes `description`. That description is the only thing telling the model what
`shortwave_radiation_sum` means, so the shipped form fills it in for every
element.

The rendered field names are deliberately not derived on the server. EXT:form
builds them from the form identifier and the surrounding plugin namespace, and
both have moved between TYPO3 versions; the trailing element identifier has
not. The client therefore resolves a control by the identifier its name ends
with, and a functional test asserts every schema property can be found that way
among the controls EXT:form actually rendered.

`FormAssistantController` renders the form through EXT:form's own view helper —
with a `factoryClass` rather than a persistence identifier, so no extension path
has to be allow-listed through a mechanism that differs per TYPO3 major — and
puts schema, tool name, description and action identifier on the plugin root as
`data-` attributes, the same transport the assistant already uses.

The rendered form is translated; the schema is not. A tool's identity should not
change with the language of the page, or an agent would discover a different
contract per language.

### Client

One bundle entry stays. `Assistant.ts` bootstraps both plugin roots, so the
site set keeps including a single file.

- `form/FormSchemaSource` reads and validates the delivered schema.
- `form/FormFiller` writes values into the rendered controls, including
  checkbox groups and multiple selects, and reads them back.
- `form/ArgumentValidator` checks the model's output against the schema before
  anything touches the DOM. `responseConstraint` is a constraint, not a
  guarantee, and model output is untrusted by house rule.
- `query/OpenMeteoQuery` is the only module that knows the data source: it
  resolves the place name through the geocoding endpoint, builds the request,
  calls `fetch` and normalises the response.
- `tools/FormTool` holds `{name, description, inputSchema, execute}` and runs
  the whole chain: check, fill, read back, run, report.
- `tools/ModelContextBinding` registers with `document.modelContext`, falling
  back to `navigator.modelContext`, and unregisters through an `AbortSignal`.
  Where neither exists only this registration is skipped.
- `tools/LocalToolLoop` is the path without WebMCP: the visitor's sentence goes
  to `prompt(input, {responseConstraint: inputSchema})`, the parsed result goes
  to the same `execute`.
- `result/ResultRenderer` draws the table and the course of the day with safe
  DOM calls, in the manner of `SafeResponseRenderer`. No new package.

`ModelSession` gains one method beside `promptStreaming`: a `prompt` that takes
a `responseConstraint` and returns the complete text. That is the only change to
the existing adapter.

### Flow

1. An editor adds the plugin and picks the form it renders.
2. The page delivers the form and, on the plugin root, the schema, the tool's
   name and description and the action identifier.
3. The tool is registered with the browser's model context where there is one.
4. A call arrives — from the plugin's own input row, or from an agent.
5. `execute` validates the arguments, writes them into the form so they are
   visible, reads the form back in full, runs the query, renders the result and
   returns a text rendering of it to the caller.
6. There is no second model call. The rendered tables are the answer; asking an
   on-device model to restate them would spend the context the forty-variable
   schema already needs.

The parameters are on screen before the request goes out; what the single-tool
cut leaves out is a confirmation step, not the visibility. The configuration
disclosure the extension already ships is extended to show the tool call with
its arguments, so the mapping from sentence to parameters stays inspectable.

## The seam to phase 2

`FormTool` talks to an action through `FormAction`: run with validated values
and report an outcome. `OpenMeteoQuery` is its only implementation. Phase 2 adds an implementation that submits the form normally,
and generalises `FormSchemaFactory` from the shipped form to any form. Schema
generation, filling, validation and registration are untouched by that step.

## Error handling

| Situation | Behaviour |
| --- | --- |
| Schema missing or invalid | Plugin shows its fallback; no tool is registered |
| WebMCP absent | Local path only; nothing else changes |
| Arguments fail validation | Tool returns the reason; the form stays untouched |
| Place name unresolved | Tool says so and names what it searched for |
| Network or HTTP failure | Tool returns the failure; the form keeps its values |
| Rate limit | Reported as such, distinct from a generic failure |
| Plugin destroyed | Registration is aborted through its signal |

Failures are returned as text rather than thrown: the caller is a model, and a
sentence it can relay is more useful than a rejected promise.

## Trust boundaries

Model output, form values and the data source's response are all untrusted.
Arguments are validated against the schema before use, enum membership
included. The response is rendered with `textContent` and element construction,
never with `innerHTML`. The only escape from Fluid escaping stays the one the
extension already has: server-rendered content elements.

## Testing

- PHP unit tests for the schema mapping, one per element type and validator,
  and for the field-name derivation.
- PHP functional tests for the rendered plugin and for the site set, alongside
  the existing pair.
- Vitest for every new TypeScript module, including a filler test that asserts
  a checkbox group ends up with the right boxes ticked, and a validator test
  that rejects an enum value outside the schema.
- Playwright for the whole chain with a stubbed model and a stubbed data
  source, plus the accessibility check the suite already applies.
- `Tests/Repository/metadata.sh` and `documentation.sh` gate metadata and
  documentation as before.

## Delivery

The extension ships the demonstration form as
`Resources/Private/Forms/weatherQuery.form.yaml` and renders it through a form
factory, so the demonstration is reproducible on any installation rather than
being a property of one page.

`typo3/cms-form` moves into `require`: the plugin cannot work without it, and a
guarded optional registration would buy nothing on an extension whose second
plugin is built on it.

The public demonstration runs on `typo3-demo.netresearch.de`, which has the
server side EXT:form needs. It is reached the way that instance is always
reached: raise the version constraint in `netresearch/typo3-demo` and merge. The
page therefore follows the release rather than preceding it.
