# nr-browser-ai

On-device AI assistant for TYPO3 frontend pages powered by Chrome built-in AI
and Gemini Nano — by [Netresearch DTT GmbH](https://www.netresearch.de/).

> Status: approved POC design and implementation planning.

## Scope

The frontend plugin answers a short dialogue from the content of the currently
open page. Inference runs locally in a supported browser. Unsupported clients
receive an editor-configured fallback content element or no plugin output.

## Project documents

- [Approved POC design](docs/superpowers/specs/2026-07-28-nr-browser-ai-poc-design.md)
- [Implementation plan](docs/superpowers/plans/2026-07-28-nr-browser-ai-poc.md)

## Target platforms

- TYPO3 12.4, 13.4 and 14.3
- PHP 8.2 through 8.5
- Chrome Prompt API with a locally managed Gemini Nano model

## License

The implementation is intended to be released under GPL-2.0-or-later.

Copyright (c) 2026 [Netresearch DTT GmbH](https://www.netresearch.de/).
