<p align="center">
  <a href="https://www.netresearch.de/">
    <img src="Resources/Public/Icons/Extension.svg" alt="Netresearch Browser AI" width="80" height="80">
  </a>
</p>

<h1 align="center">Netresearch Browser AI for TYPO3</h1>

<p align="center">
  <strong>Page-grounded answers using Chrome built-in AI on the visitor's device</strong>
</p>

<p align="center">
  <a href="https://netresearch.github.io/t3x-nr-browser-ai/"><strong>Live demo</strong></a> —
  runs the real bundle and answers from the demo page's own content.
  Without a supported browser it shows the extension's fallback instead.
</p>

<p align="center">
  <a href="https://github.com/netresearch/t3x-nr-browser-ai/actions/workflows/ci.yml"><img src="https://github.com/netresearch/t3x-nr-browser-ai/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://codecov.io/gh/netresearch/t3x-nr-browser-ai"><img src="https://codecov.io/gh/netresearch/t3x-nr-browser-ai/graph/badge.svg" alt="Codecov"></a>
  <a href="https://phpstan.org/"><img src="https://img.shields.io/badge/PHPStan-level%2010-brightgreen.svg" alt="PHPStan level 10"></a>
  <a href="https://www.php.net/"><img src="https://img.shields.io/badge/PHP-8.2%2B-blue.svg" alt="PHP 8.2+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--2.0--or--later-blue.svg" alt="GPL-2.0-or-later"></a>
  <a href="https://typo3.org/"><img src="https://img.shields.io/badge/TYPO3-12.4%20%7C%2013.4%20%7C%2014.3-orange.svg" alt="TYPO3 12.4, 13.4 and 14.3"></a>
</p>

---

This frontend plugin answers questions from the content of the currently open
page. Chrome's Prompt API runs Gemini Nano locally; there is no application
API key, server-side LLM proxy, chat persistence or telemetry.

This is a proof of concept. It deliberately grounds answers in one selected
DOM area on the current page. The provider boundary permits future page-tree
or whole-site context providers, but those scopes are not implemented.

## Requirements

- TYPO3 12.4, 13.4 and 14.3 with PHP 8.2 through 8.5. TYPO3 12.4 is
  compatibility-only and requires a maintained security-patched distribution.
- Chrome 148 or newer on Windows 10/11, macOS 13+, Linux, or Chromebook Plus
  with ChromeOS platform 16389+.
- 22 GB free storage before the model download. Chrome also requires either a
  GPU with more than 4 GB VRAM or at least 16 GB RAM and four CPU cores.
- An unmetered network for the initial model download.

See [browser setup](Documentation/User/BrowserSetup.rst) for the complete
Chrome requirements and troubleshooting steps.

## Installation

```bash
composer require netresearch/nr-browser-ai
vendor/bin/typo3 extension:setup
```

Include the extension's static TypoScript in the site root template. Add the
content element **Netresearch Browser AI** on a page, then configure its title,
introduction, editor instruction, context selector and fallback.

## Configuration model

- Administrators own the system prompt in TypoScript at
  `plugin.tx_nrbrowserai_assistant.settings.systemPrompt`.
- Editors may append a supplemental instruction in the plugin FlexForm. It
  does not replace the administrator prompt.
- The CSS selector defaults to `main` and selects content only from the
  currently open page. Scripts, forms and the assistant itself are excluded.
- Answers use the language of the question, falling back to the page language
  from `<html lang>` when the question is too short to identify.
- Unsupported clients and permanent setup errors show the selected same-page
  fallback content element or no output, according to the plugin setting.
- During setup, the initial page source is reduced when necessary to fit the
  default 80% context-usage target. Before each new question, no prompt starts
  when Chrome reports that current usage has reached that threshold; the user
  must select **Reset**. A generated response can take usage beyond the target.

Detailed settings are in the
[administrator reference](Documentation/Administration/Configuration.rst).

## Privacy and security

No question, page content or answer is sent to an application service. Model
inference and the dialogue stay in browser memory and are discarded on reset
or navigation. Chrome manages the model download and storage; the extension
has no server endpoint, database persistence, cookies or analytics for chat
data.

Model output is rendered with DOM APIs only: a restricted Markdown subset is
built from `createElement` and text nodes, links are limited to validated
HTTP(S) URLs, and no HTML is ever parsed. Site owners
remain responsible for the page content selected as context, their privacy
notice, Chrome/browser governance and their Content-Security-Policy.

Read the [privacy and security notes](Documentation/Security/Privacy.rst)
before production evaluation.

## Development

```bash
ddev start
ddev install-all
composer ci:test:php:unit
npm ci
npm run ci
```

The DDEV overview is at <https://nr-browser-ai.ddev.site/> and contains
disposable TYPO3 12.4, 13.4 and 14.3 installations.

## Documentation, contributing and support

- [TYPO3 manual](Documentation/Index.rst).
- [Contribution guide](CONTRIBUTING.md).
- [Security policy](SECURITY.md).
- [GitHub issues](https://github.com/netresearch/t3x-nr-browser-ai/issues).

## License

The extension source is licensed under GPL-2.0-or-later. See
[LICENSE](LICENSE). The manual in `Documentation/` is licensed under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).

Developed and maintained by [Netresearch DTT GmbH](https://www.netresearch.de/)
