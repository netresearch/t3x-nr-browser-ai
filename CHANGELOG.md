# Changelog

All notable changes to this extension are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-08-11

### Added

- The form assistant answers in prose. After the query runs, the on-device
  model is asked a second time — unconstrained this time — what the result
  means for the question that was asked, and that sentence appears directly
  under the request. The phrasing happens on the page's own path and never
  inside the tool: an agent reaching the tool through the browser's model
  context receives the result text and phrases it in its own voice.

  A phrasing call that fails leaves the tables in place and says nothing
  rather than guessing, and it is skipped entirely when no query produced
  anything worth phrasing.
- One request may now imply several queries. The derivation is constrained to
  a list of argument sets rather than a single one, so "compare the rainfall
  of the past week in Tokyo and in Leipzig" is two runs and one answer, with
  each result in its own section and every call listed in the disclosure.
  Capped at four queries per request.

### Changed

- After a run the form collapses behind a disclosure, so the answer sits next
  to the question rather than below seventy controls. It stays in the document
  and one keystroke away — correcting a derived value is the other half of the
  point — and a browser without an on-device model is never handed a closed
  form, because it never runs anything.
- The `pastDays` field no longer claims to deliver *measured* past weather.
  The data source's documentation states only that earlier days are returned
  and keeps the archive as a separate API, so the claim was stronger than its
  source.

### Supported versions

Unchanged from 0.5.0.

## [0.5.0] - 2026-08-11

### Added

- A second plugin, **Netresearch Browser AI form assistant**, that turns one
  sentence into a filled parameter-rich form and a real result. The chain is
  intent, structured output, tool call, action: the request goes to the
  on-device model constrained by the form's own JSON Schema, the arguments that
  come back are checked, written into the visible controls and run, and the
  result is rendered as tables.

  The schema is generated from the EXT:form definition rather than written by
  hand, because that definition already carries the option values, the bounds,
  whether an entry is mandatory and a sentence per element saying what it
  means. Generating it is also what makes a large form affordable for an
  on-device model: a multi-value element becomes one array property carrying
  its options as an enum, not one boolean property per option.
- The same tool is registered with the browser's model context where the
  browser provides one — `document.modelContext`, falling back to the
  deprecated `navigator.modelContext` — so an agent outside the page can call
  it with the identical schema and receive the same result. Where neither
  exists, only that registration is skipped.
- A demonstration form shipped with the extension,
  `Resources/Private/Forms/weatherQuery.form.yaml`, querying the open
  Open-Meteo service across its full parameter surface: forty-four hourly
  variables, twenty-two daily ones, current conditions, a model choice, four
  unit groups, a time range and a grid-cell preference.
- A per-content-element disclosure for the new plugin, naming the tool, its
  description, the system prompt, the input schema and the arguments of the
  last call.

### Changed

- `typo3/cms-form` is now a requirement. The second plugin is built on it.
- The repository's own metadata and documentation assertions run in CI. They
  were listed in `AGENTS.md` as commands that have to pass, and nothing invoked
  them; the metadata assertion had contradicted `composer.json` for four
  commits without anyone noticing.

### Fixed

- The published demonstration page's call-to-action links rendered white on the
  primary brand tone, which reaches 3.37:1 — below the 4.5:1 WCAG 2 AA asks of
  normal text.

### Supported versions

Unchanged from 0.4.0. The form assistant additionally requires `typo3/cms-form`,
which ships with every supported TYPO3 version.

## [0.4.0] - 2026-08-03

### Added

- A per-content-element switch that discloses what the assistant sends: the
  system prompt, the editor instruction, the page area used as the source and
  the context limit, rendered from the values the assistant itself uses. It sits
  outside the block that stays hidden until the browser reports a usable model,
  so what would be sent is readable in a browser that cannot run the assistant —
  which is most of them.
- An answer for the questions the page cannot answer. `notFoundMode` set to
  `contentElement` shows an editor-selected element in place of the model's
  refusal, picked under the same rules as `fallbackContent`. The model is asked
  to signal an unanswerable question with a marker, and the interface swaps in
  the prepared element.

  The instruction and the marker are added only when the selected element
  actually renders, so a missing, hidden or cyclic reference can never leave a
  visitor looking at the bare token. A model that ignores the marker answers as
  before, so the failure mode is the previous behaviour.

### Supported versions

Unchanged from 0.3.0.

## [0.3.0] - 2026-08-02

### Added

- Site set `netresearch/browser-ai`. A TYPO3 site assembled from site sets has
  no `sys_template` record, so the static TypoScript include never runs and the
  content element has no rendering definition; the set is how such a site loads
  the extension's TypoScript. Add it to the `dependencies` of the site package's
  set, or to the site's own `config.yaml`.
- `contextSelector`, `contextUsageLimit` and `systemPrompt` as typed site
  settings, editable per site under Site Management and settable in a site's
  `settings.yaml`. The latter two previously had no interface at all.

### Fixed

- The system prompt reached the model as its first sentence only on sites
  loading the extension through the set, dropping the instruction to state when
  an answer is absent and the instruction to treat page content as untrusted
  data. TYPO3 serialises site settings into TypoScript constants text as
  `key = value` lines, so a value containing a newline loses everything after
  the first. The shipped prompt is now one line, and the setting is declared
  `string` rather than `text` so a multiline field does not invite an override
  that would be truncated the same way.

### Changed

- The plugin's TypoScript now lives in the site set, and the static include
  imports it, so both mechanisms are served from one statement of the
  configuration. The reverse direction does not work: an `@import` inside a site
  set applies the imported file's `page.*` assignments but delivers its
  `tt_content.*` assignments without their object type.

### Supported versions

Unchanged from 0.2.0. TYPO3 12.4 keeps the static include and is unaffected by
the set.

## [0.2.0] - 2026-08-01

First published release. Version 0.1.0 was declared but never released, so
this entry covers the extension as a whole.

### Added

- Frontend plugin that answers visitor questions from the content of the
  currently open page, using Chrome's built-in Prompt API on the visitor's
  device. The extension defines no chat endpoint, database table, cookie,
  local storage or telemetry.
- Two prompt layers: administrators own the system prompt in TypoScript,
  editors may append a supplemental instruction per plugin without replacing
  it.
- Configurable context selector, defaulting to `main`, restricted to the
  current page. Scripts, forms, hidden elements and the assistant itself are
  excluded from the extracted source.
- Context-budget handling: the page source is reduced to fit the configured
  usage target, and a new question is refused when the reported usage has
  reached that target.
- Fallback modes `none` and `contentElement` for browsers without an
  on-device model. Hidden, deleted and cyclic references produce no output;
  access restrictions and time-based publishing continue to apply.
- Model output rendered with DOM APIs only, covering a restricted Markdown
  subset — emphasis, inline and fenced code, lists, headings, block quotes
  and thematic breaks. No markup string is assembled and no HTML is parsed.
  Links are limited to validated HTTP(S) URLs, in bare or Markdown syntax,
  and external links open with `rel="noopener noreferrer"`.
- Keyboard-complete lifecycle with controls that stay focusable rather than
  disabled, and a polite live region that announces the finished answer once
  instead of streaming partial output to assistive technology.
- Answers in the language of the question, falling back to the page language
  from the `html` element's `lang` attribute when the question is too short to
  identify. The Prompt API's `expectedOutputs` capability alone does not
  constrain the response, so the requirement is stated in the instruction.
- German translations for the frontend and the backend labels.
- Public demo at <https://netresearch.github.io/t3x-nr-browser-ai/>, running
  the distributable bundle against the demo page's own content.

### Supported versions

- TYPO3 12.4, 13.4 and 14.3. TYPO3 12.4 is a compatibility target and
  requires a maintained security-patched distribution.
- PHP 8.2 through 8.5.
- Chrome 148 or newer for the assistant itself; other browsers receive the
  configured fallback.

[0.6.0]: https://github.com/netresearch/t3x-nr-browser-ai/releases/tag/v0.6.0
[0.5.0]: https://github.com/netresearch/t3x-nr-browser-ai/releases/tag/v0.5.0
[0.4.0]: https://github.com/netresearch/t3x-nr-browser-ai/releases/tag/v0.4.0
[0.3.0]: https://github.com/netresearch/t3x-nr-browser-ai/releases/tag/v0.3.0
[0.2.0]: https://github.com/netresearch/t3x-nr-browser-ai/releases/tag/v0.2.0
