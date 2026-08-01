# Changelog

All notable changes to this extension are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- German translations for the frontend and the backend labels.
- Public demo at <https://netresearch.github.io/t3x-nr-browser-ai/>, running
  the distributable bundle against the demo page's own content.

### Supported versions

- TYPO3 12.4, 13.4 and 14.3. TYPO3 12.4 is a compatibility target and
  requires a maintained security-patched distribution.
- PHP 8.2 through 8.5.
- Chrome 148 or newer for the assistant itself; other browsers receive the
  configured fallback.

[0.2.0]: https://github.com/netresearch/t3x-nr-browser-ai/releases/tag/v0.2.0
