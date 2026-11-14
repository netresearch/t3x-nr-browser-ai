<!-- SPDX-License-Identifier: GPL-2.0-or-later -->
<!-- SPDX-FileCopyrightText: Netresearch DTT GmbH -->
# ADR-0005: Forms come from the backend, the model runtime stays the Prompt API

## Status

Accepted

## Date

2026-11-14

## Context

[ADR-0003](0003-form-assistant-schema-and-seam.md) staged the form assistant:
one form shipped inside the extension now, a generic bridge later. This is the
later step. Two gaps remained.

The assistant only knew `weatherQuery`. Its definition, its field descriptions
and its data source lived in the extension's files, so an editor could change
none of them.

And a source outside this repository describes the runtime as WebGPU and
WebLLM, while the code uses only Chrome's Prompt API.

## Decision

| Question | Decision | Reason |
| --- | --- | --- |
| Where the form lives | The EXT:form storage: a form created in the TYPO3 form editor | Editors already maintain forms there, with access rights, versions and translations |
| How a plugin names it | `settings.persistenceIdentifier` in the plugin FlexForm, a select filled from the persistence manager | Same field name and `softref` as the core form plugin, so `form:definition:transfer --move` re-points this plugin too |
| Bundled form | Stays: `settings.formIdentifier`, used when no stored form is chosen | `weatherQuery` keeps working untouched |
| Field descriptions | `properties.elementDescription`, the form editor's "Description" field | The schema factory already reads it; all three supported majors expose it in the editor |
| Tool description and data source | Plugin FlexForm first, then `renderingOptions.nrBrowserAi` in the definition, then a sentence derived from the form label | The form editor has no UI for `renderingOptions.nrBrowserAi`, so the plugin record is the place an editor can reach |
| Data source | `openMeteo` (built in) or `jsonEndpoint`: an HTTPS GET to a URL the editor enters, on a host the administrator allow-listed | The allow-list is administrator-owned, the endpoint editor-owned |
| Submitting the form | Not offered | See below |
| Model runtime | Chrome Prompt API only; no WebLLM | See below |

### One array for controls and schema

The controller loads the definition once. The same array goes to
`FormSchemaFactory` and, as the override configuration of the core
`ArrayFormFactory`, to `formvh:render`. The custom factory that re-read the
bundled file is gone. Loading the form a second time inside the view helper
could, through a TypoScript form override, describe a different form than the
schema does.

### Loading across TYPO3 12.4, 13.4 and 14.3

`FormPersistenceManagerInterface::load()` has three signatures: the identifier
(12.4), plus form settings and TypoScript settings (13.4), TypoScript settings
and the request (14.3). `listForms()` likewise differs in arguments and in
return type. `StorageFormLoader` and `FormCatalog` assemble the arguments per
major, mirroring what the core `formvh:render` view helper and the core form
selector do, and call through reflection so static analysis against one major
does not reject the other two. The functional tests run the same assertions on
all three majors; each puts the test form where that major keeps forms
(database from 14, extension path before).

A persistence identifier is checked against a fixed shape before it reaches
the manager: a database uid, a file mount path ending in `.form.yaml` or an
extension path ending in `.form.yaml`, and no `..`. This is a shape check, not
an access check. The core form plugin loads whatever identifier its record
names, and so does this plugin: the selector lists only forms the editor may
read, but a backend user who can edit the plugin record can store any
well-formed identifier, and the frontend renders that form (finishers do not
run, the plugin handles no submission). An installation that separates form
access from content editing should restrict who may edit these plugin records.
Plugin output is cached with the page, so a deleted or changed form shows until
the page cache entry expires. A form that cannot be loaded renders nothing but a short notice, never a
different form than the one chosen.

### Multi-step forms

EXT:form renders one page of a multi-step form at a time, so the controls of
later pages are not in the document. Only the first page is described to the
model; inputs of later pages are reported as unmapped.

### Why no submission

The plugin is a cached content element and has no submission handling. A
normal submission needs the core form runtime on an uncached action. Offering
"fill and submit" here would silently do nothing for the visitor. The assistant
fills the visible controls and runs the data source; a form that submits stays
the core form plugin's job.

### Why no WebLLM runtime

The decision is a quality judgement, not an effort one. A WebLLM adapter would
fit behind `LanguageModelAdapter`, and structured output exists on that side
too. The evidence against building it is what the runtime does on the wire and
what the test pipeline can prove.

- **It breaks the privacy statement.** `@mlc-ai/web-llm` 0.2.88 (Apache-2.0,
  14.4 MB unpacked, read from the published tarball) configures its models
  against `https://huggingface.co/mlc-ai/…` for weights and
  `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/`
  for the compiled model library. The visitor's browser would contact two third
  parties, and execute a WebAssembly and shader library fetched from the
  mutable `main` branch of a repository the project does not control. The
  Prompt API route has the browser fetch its own model; the extension and the
  site contact nobody. [ADR-0002](0002-on-device-assistant-boundaries.md) and
  `Documentation/Security/Privacy.rst` state exactly that.
- **Self-hosting weights moves the burden.** Pinning the libraries and serving
  weights from the TYPO3 host makes the extension ship or fetch several hundred
  megabytes to several gigabytes per model, with licence terms per model.
- **It cannot be verified here.** Headless Chromium in CI has no usable WebGPU
  adapter. A runtime no pipeline can run is a runtime no pipeline can guard.
- **The library is pre-1.0 and releases every few days**, which is at odds with
  a committed, single-file bundle checked by the `assets` job.

Revisit when an operator needs a model that Chrome does not provide, and then
as a separately installable adapter package that carries its own privacy
statement. The seam for it already exists.

What changed instead: the documentation now says in one place that the runtime
is Chrome's Prompt API and nothing else, and that the GPU figures in the setup
guide are Chrome's requirements for its built-in model.
The repository, its metadata, the published demo page and the demo database
seed contain no WebGPU or WebLLM claim (searched 2026-11-14); the statement
that prompted this lives outside them and has to be corrected at its source.

The `jsonEndpoint` data source and the `allowedDataSourceHosts` setting are
delivered by the change that follows this one.

Administrator-owned settings (the system prompts, the context usage limit and
the host list) are read from the frontend TypoScript setup only
(`Classes/Configuration/AdministratorSettings.php`), never from
`$this->settings`: Extbase merges a plugin record's FlexForm over TypoScript,
so a record written around the backend could otherwise carry such a key and
replace the prompt or widen the host list. The FlexForm declares none of them,
and a functional test stores them in a record anyway and checks they are
ignored.

## Non-goals

No submission of the form, no server-side form execution, no persistence of
requests or results. The boundaries in ADR-0002 and `AGENTS.md` hold unchanged.

## Consequences

An editor can create a form in the form editor, describe its fields there, pick
it in the plugin and name the data source, without a code change. A form
without a data source stays a plain form and registers no tool.

Whoever writes `renderingOptions.nrBrowserAi` by hand in a definition (the
bundled form does) keeps that working; the plugin record overrides it.

The `jsonEndpoint` data source sends the values of the form's parameters to the
named host from the visitor's browser. That host must be allow-listed by the
administrator (`allowedDataSourceHosts`, empty by default), named in the site's
privacy information and permitted by the site's Content Security Policy.
