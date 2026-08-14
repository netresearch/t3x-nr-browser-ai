# ADR-0003: The form definition is the tool contract

## Status

Accepted

## Date

2026-08-11

## Context

The assistant needed a demonstration that shows a model doing something rather
than describing something. A form is that demonstration: the model has to
produce structured, validated arguments, and the result is visible in the page.

The question was where the tool's parameter schema comes from. Hand-writing a
JSON Schema next to the form duplicates every option list and validator, and
the two drift apart on the first edit.

## Decision

| Question | Decision | Reason |
| --- | --- | --- |
| Scope | Staged: one built-in form now, generic bridge later | The demo carries itself and the later step discards nothing |
| Data source | Open-Meteo | Keyless, CORS-enabled, own geocoding, large parameter surface |
| Schema source | The EXT:form definition | Carries validators, options and descriptions — the semantics a model needs |
| Execution | Client-side `fetch` | Keeps the extension free of server endpoints and works on a static demo |
| Tool cut | One tool, whole chain | Shortest chain; the caller receives the result and can summarise it |
| Form size | Full parameter surface | The complexity is the point |

The full parameter surface is affordable *because* of the schema source: forty
hourly variables are one `MultiCheckbox` element, and therefore one schema
property of type `array` whose `items` carry forty `enum` values — not forty
boolean properties.

`FormTool` reaches its action through a `FormAction` interface: run with
validated values, report an outcome. `OpenMeteoQuery` is its only
implementation today. A later phase adds an implementation that submits the
form normally and generalises `FormSchemaFactory` from the shipped form to any
form; schema generation, filling, validation and registration are untouched by
that step.

Failures are returned as text rather than thrown. The caller is a model, and a
sentence it can relay is more useful than a rejected promise. That covers a
missing or invalid schema (the plugin shows its fallback and registers no
tool), an absent WebMCP, arguments that fail validation, an unresolved place
name, network and HTTP failures, rate limiting as its own case, and a
destroyed plugin aborting registration through its signal.

## Non-goals

No server endpoint, no persistence, no telemetry — the boundaries in
[ADR-0002](0002-on-device-assistant-boundaries.md) and `AGENTS.md` hold
unchanged. No submission of arbitrary forms; that sits behind the `FormAction`
seam. No cross-origin tool exposure (`exposedTo`, `fromOrigins`): the tool
belongs to the page that renders the form.

## Consequences

Model output, form values and the data source's response are all untrusted.
Arguments are validated against the schema before use, enum membership
included. The response is rendered with `textContent` and element
construction, never with `innerHTML`. The only escape from Fluid escaping
stays the one the extension already has: server-rendered content elements.

Because the schema is derived, a change to the form definition changes the
tool contract without a code change — which is the point, and also why
`FormSchemaFactoryTest` asserts that the shipped YAML descriptions and the XLF
sources stay in step.
