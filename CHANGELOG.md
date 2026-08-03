# Changelog

All notable changes to this extension are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.4.0]: https://github.com/netresearch/t3x-nr-browser-ai/releases/tag/v0.4.0
[0.3.0]: https://github.com/netresearch/t3x-nr-browser-ai/releases/tag/v0.3.0
[0.2.0]: https://github.com/netresearch/t3x-nr-browser-ai/releases/tag/v0.2.0
